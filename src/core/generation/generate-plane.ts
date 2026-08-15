import { CONTENT_REGISTRY } from "../data/registry";
import { CORE_IDENTITY } from "../identity";
import type { FamilyId } from "../model/ids";
import {
  compareCoordinates,
  MAP_SIZE,
  OLYMPUS_PLANE,
  planeKey,
  planesEqual,
  STARTING_PLANE,
  type MapCoordinate,
  type PlanePair,
} from "../model/plane";
import { bytesToHex, sha256 } from "./sha256";
import { boundedInt } from "./semantic-random";
import { canonicalizeValue } from "./canonical";
import { allCells, cellKey, emptyGrid, orthogonalNeighbours } from "./grid";
import {
  generateBlob,
  generateRectangle,
  generateStamp,
  primitiveParts,
  type StampMatrix,
} from "./geometry-primitives";
import { isOccupiable } from "./plane-occupancy";
import { repairPlaneGeometry } from "./plane-repair";
import type {
  NamedPoint,
  PlaneBase,
  PlaneGenerationResult,
  PlaneGrid,
  PlaneRepairEvent,
  PlaneValidationIssue,
  PrimitiveContext,
} from "./plane-types";
import { interactionPoints, validatePlaneGeometry } from "./plane-validate";
import type { WorldTopology } from "./topology-types";

const FAMILY_BASE_TILE: Record<FamilyId, string> = {
  aboveground: "grass",
  inside: "wood_floor",
  dungeon: "cave_floor",
  arcane: "arcane_floor",
  ethereal: "spectral_floor",
  space: "vacuum",
  void: "void_floor",
  olympus: "divine_floor",
};

const FAMILY_FILL_TILE: Partial<Record<FamilyId, string>> = {
  inside: "solid_rock",
  dungeon: "solid_rock",
};

const WRAPPING_FAMILIES = new Set<FamilyId>(["arcane", "space"]);

const FAMILY_HAZARD_TILE: Partial<Record<FamilyId, string>> = {
  aboveground: "poison_mire",
  dungeon: "lava",
  arcane: "unstable_arcane",
  void: "void_erosion",
};

function scatterHazards(
  ctx: PrimitiveContext,
  grid: PlaneGrid,
  family: FamilyId,
  reserved: Set<string>,
): void {
  const tileId = FAMILY_HAZARD_TILE[family];
  const familyDef = CONTENT_REGISTRY.planeFamilies.find((row) => row.id === family);
  if (!tileId || !familyDef) {
    return;
  }
  const candidates = allCells().filter((cell) => isFreeOccupiable(grid, cell, reserved));
  if (candidates.length === 0) {
    return;
  }
  const percent = boundedInt(
    primitiveParts(ctx, "hazard.density"),
    familyDef.hazardDensityMinPercent,
    familyDef.hazardDensityMaxPercent,
  );
  const target = Math.floor((candidates.length * percent) / 100);
  const remaining = [...candidates].sort(compareCoordinates);
  for (let i = 0; i < target && remaining.length > 0; i += 1) {
    const index = boundedInt(primitiveParts(ctx, "hazard.select", i), 0, remaining.length - 1);
    const cell = remaining.splice(index, 1)[0]!;
    grid.terrain[cell.y]![cell.x] = tileId;
  }
}

const ANCHOR_STAMP: StampMatrix = {
  cells: [
    [null, null, null],
    [null, "safe_anchor", null],
    [null, null, null],
  ],
  namedPoints: { anchor: { x: 1, y: 1 }, approach: { x: 1, y: 2 } },
};

const ARENA_STAMP: StampMatrix = {
  cells: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "clear")),
  namedPoints: {
    playerEntry: { x: 1, y: 9 },
    bossSpawn: { x: 5, y: 1 },
    centre: { x: 5, y: 5 },
  },
};

function familyForPlane(plane: PlanePair, topology?: WorldTopology): FamilyId {
  const node = topology?.planeNodes.find((row) => planesEqual(row.plane, plane));
  if (node) {
    return node.family;
  }
  return CONTENT_REGISTRY.byId.dimension.get(plane.b)?.family ?? "aboveground";
}

function wrapsForFamily(family: FamilyId): boolean {
  return WRAPPING_FAMILIES.has(family);
}

function context(
  generatorVersion: string,
  worldSeed: string,
  plane: PlanePair,
  purposeTag: string,
  featureRecipeInstanceId: string,
  primitiveOrdinal: number,
  attempt = 0,
): PrimitiveContext {
  return { generatorVersion, worldSeed, plane, purposeTag, featureRecipeInstanceId, primitiveOrdinal, attempt };
}

function allowedInBounds(cell: MapCoordinate): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < MAP_SIZE && cell.y < MAP_SIZE;
}

function paintTerrain(grid: PlaneGrid, cells: readonly MapCoordinate[], tileId: string): void {
  for (const cell of cells) {
    grid.terrain[cell.y]![cell.x] = tileId;
  }
}

function placeFeature(
  grid: PlaneGrid,
  cell: MapCoordinate,
  featureId: string,
  origin: NonNullable<PlaneGrid["featureOrigin"][number][number]>,
): void {
  grid.features[cell.y]![cell.x] = featureId;
  grid.featureOrigin[cell.y]![cell.x] = origin;
}

function isFreeOccupiable(grid: PlaneGrid, cell: MapCoordinate, reserved: Set<string>): boolean {
  return isOccupiable(grid, cell) && !reserved.has(cellKey(cell));
}

function reserve(reserved: Set<string>, cell: MapCoordinate): void {
  reserved.add(cellKey(cell));
}

function pickCell(ctx: PrimitiveContext, tag: string, cells: readonly MapCoordinate[]): MapCoordinate | null {
  if (cells.length === 0) {
    return null;
  }
  const sorted = [...cells].sort(compareCoordinates);
  const index = boundedInt(primitiveParts(ctx, tag), 0, sorted.length - 1);
  return sorted[index]!;
}

function freeNeighbours(grid: PlaneGrid, wraps: boolean, cell: MapCoordinate, reserved: Set<string>): MapCoordinate[] {
  return orthogonalNeighbours(cell, wraps).filter((neighbour) => isFreeOccupiable(grid, neighbour, reserved));
}

function chooseOccupiable(
  ctx: PrimitiveContext,
  grid: PlaneGrid,
  reserved: Set<string>,
  tag: string,
): MapCoordinate | null {
  return pickCell(ctx, tag, allCells().filter((cell) => isFreeOccupiable(grid, cell, reserved)));
}

function chooseBlockingInteractable(
  ctx: PrimitiveContext,
  grid: PlaneGrid,
  wraps: boolean,
  reserved: Set<string>,
  tag: string,
): { object: MapCoordinate; approach: MapCoordinate } | null {
  const candidates = allCells().filter(
    (cell) => isFreeOccupiable(grid, cell, reserved) && freeNeighbours(grid, wraps, cell, reserved).length > 0,
  );
  const object = pickCell(ctx, `${tag}.object`, candidates);
  if (!object) {
    return null;
  }
  const approach = pickCell(ctx, `${tag}.approach`, freeNeighbours(grid, wraps, object, reserved));
  if (!approach) {
    return null;
  }
  return { object, approach };
}

function placeOccupiableActor(
  ctx: PrimitiveContext,
  grid: PlaneGrid,
  wraps: boolean,
  reserved: Set<string>,
  baseTile: string,
  namedPoints: NamedPoint[],
  placementFailures: PlaneValidationIssue[],
  id: string,
  kind: string,
  tag: string,
): void {
  const placed = chooseBlockingInteractable(ctx, grid, wraps, reserved, tag);
  if (!placed) {
    placementFailures.push({ validator: "required_fixture_unplaced", detail: id });
    return;
  }
  grid.terrain[placed.object.y]![placed.object.x] = baseTile;
  grid.terrain[placed.approach.y]![placed.approach.x] = baseTile;
  namedPoints.push({ id, kind, x: placed.object.x, y: placed.object.y });
  namedPoints.push({ id: `${id}.approach`, kind: "approach", x: placed.approach.x, y: placed.approach.y });
  reserve(reserved, placed.object);
  reserve(reserved, placed.approach);
}

function chooseShopGeometry(
  ctx: PrimitiveContext,
  grid: PlaneGrid,
  wraps: boolean,
  reserved: Set<string>,
): { counter: MapCoordinate; shopkeeper: MapCoordinate; customer: MapCoordinate } | null {
  const candidates = allCells().filter(
    (cell) => isFreeOccupiable(grid, cell, reserved) && freeNeighbours(grid, wraps, cell, reserved).length >= 2,
  );
  const counter = pickCell(ctx, "shop.counter", candidates);
  if (!counter) {
    return null;
  }
  const sides = freeNeighbours(grid, wraps, counter, reserved);
  const shopkeeper = pickCell(ctx, "shop.shopkeeper", sides);
  if (!shopkeeper) {
    return null;
  }
  const remaining = sides.filter((cell) => cellKey(cell) !== cellKey(shopkeeper));
  const customer = pickCell(ctx, "shop.customer", remaining);
  if (!customer) {
    return null;
  }
  return { counter, shopkeeper, customer };
}

export function hashPlaneBase(plane: Omit<PlaneBase, "planeHash">): string {
  const canonical = canonicalizeValue({
    generatorVersion: plane.generatorVersion,
    worldSeed: plane.worldSeed,
    plane: plane.plane,
    family: plane.family,
    wraps: plane.wraps,
    terrain: plane.terrain,
    features: plane.features,
    namedPoints: [...plane.namedPoints].sort((left, right) => compareCoordinates(left, right) || (left.id < right.id ? -1 : 1)),
    spawnRegions: plane.spawnRegions.map((region) => ({
      tag: region.tag,
      cells: [...region.cells].sort(compareCoordinates),
    })),
    transitionFixtures: [...plane.transitionFixtures].sort((left, right) => compareCoordinates(left, right) || (left.transitionId < right.transitionId ? -1 : 1)),
  });
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical))));
}

export function generatePlaneBase(
  worldSeed: string,
  topology: WorldTopology,
  plane: PlanePair,
  generatorVersion = CORE_IDENTITY.generatorVersion,
): PlaneGenerationResult {
  const family = familyForPlane(plane, topology);
  const wraps = wrapsForFamily(family);
  const baseTile = FAMILY_BASE_TILE[family];
  const fillTile = FAMILY_FILL_TILE[family];
  const grid: PlaneGrid = {
    terrain: emptyGrid(fillTile ?? baseTile),
    features: emptyGrid<string | null>(null),
    featureOrigin: emptyGrid<PlaneGrid["featureOrigin"][number][number]>(null),
  };
  if (fillTile) {
    paintTerrain(grid, allCells(), fillTile);
  } else {
    paintTerrain(grid, allCells(), baseTile);
  }

  const majorCtx = context(generatorVersion, worldSeed, plane, "majorFeatures", `${planeKey(plane)}.major`, 0);
  if (fillTile) {
    const rooms = family === "dungeon" ? 4 : 3;
    for (let i = 0; i < rooms; i += 1) {
      const room = generateRectangle(context(generatorVersion, worldSeed, plane, "structures", `${planeKey(plane)}.room.${i}`, i), 4, 4, allowedInBounds, true);
      if (room.ok) {
        paintTerrain(grid, room.cells, baseTile);
      }
    }
  } else if (family === "arcane" || family === "void") {
    const blob = generateBlob(majorCtx, 28, "medium", "high", allowedInBounds, 8);
    if (blob.ok) {
      paintTerrain(grid, blob.cells, baseTile);
    }
  }

  const namedPoints: NamedPoint[] = [];
  const transitionFixtures: { transitionId: string; x: number; y: number }[] = [];
  const placementFailures: PlaneValidationIssue[] = [];
  const reserved = new Set<string>();

  if (planesEqual(plane, STARTING_PLANE)) {
    const stamp = generateStamp(
      context(generatorVersion, worldSeed, plane, "anchors", `${planeKey(plane)}.anchor`, 0),
      ANCHOR_STAMP,
      ["identity", "rotate90", "rotate180", "rotate270"],
      (cell) => allowedInBounds(cell),
    );
    if (stamp.ok && stamp.origin && stamp.namedPoints) {
      const anchor = stamp.namedPoints.anchor;
      if (anchor) {
        grid.terrain[anchor.y]![anchor.x] = baseTile;
        placeFeature(grid, anchor, "safe_anchor", "required");
        namedPoints.push({ id: "safe_anchor", kind: "anchor", x: anchor.x, y: anchor.y });
        reserve(reserved, anchor);
        const approach = stamp.namedPoints.approach ?? { x: anchor.x, y: Math.min(MAP_SIZE - 1, anchor.y + 1) };
        grid.terrain[approach.y]![approach.x] = baseTile;
        namedPoints.push({ id: "safe_anchor.approach", kind: "approach", x: approach.x, y: approach.y });
        reserve(reserved, approach);
      }
    }
  }

  if (planesEqual(plane, OLYMPUS_PLANE)) {
    const stamp = generateStamp(
      context(generatorVersion, worldSeed, plane, "structures", `${planeKey(plane)}.arena`, 0),
      ARENA_STAMP,
      ["identity"],
      allowedInBounds,
    );
    if (stamp.ok && stamp.namedPoints) {
      paintTerrain(grid, stamp.cells, "divine_floor");
      for (const [kind, point] of Object.entries(stamp.namedPoints)) {
        namedPoints.push({ id: `olympus.${kind}`, kind, x: point.x, y: point.y });
        reserve(reserved, point);
      }
    }
  }

  const transitions = topology.transitions.filter(
    (row) => planesEqual(row.sourcePlane, plane) || planesEqual(row.destinationPlane, plane),
  );
  transitions.forEach((transition, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "transitions", transition.id, index);
    const cell = chooseOccupiable(ctx, grid, reserved, "fixture");
    if (!cell) {
      placementFailures.push({ validator: "required_fixture_unplaced", detail: transition.id });
      return;
    }
    grid.terrain[cell.y]![cell.x] = baseTile;
    placeFeature(grid, cell, "transition_fixture", "required");
    transitionFixtures.push({ transitionId: transition.id, x: cell.x, y: cell.y });
    namedPoints.push({ id: `transition.${transition.id}`, kind: "transition", x: cell.x, y: cell.y });
    reserve(reserved, cell);
  });

  const sources = topology.progressionSources.filter((source) => planesEqual(source.plane, plane));
  sources.forEach((source, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "items", source.id, index);
    const blocking = source.sourceType === "container" || source.sourceType === "fixed_item";
    if (blocking) {
      const placed = chooseBlockingInteractable(ctx, grid, wraps, reserved, "source");
      if (!placed) {
        placementFailures.push({ validator: "required_fixture_unplaced", detail: source.id });
        return;
      }
      grid.terrain[placed.object.y]![placed.object.x] = baseTile;
      grid.terrain[placed.approach.y]![placed.approach.x] = baseTile;
      placeFeature(grid, placed.object, "container_chest", "required");
      namedPoints.push({ id: source.id, kind: "source", x: placed.object.x, y: placed.object.y });
      namedPoints.push({ id: `${source.id}.approach`, kind: "approach", x: placed.approach.x, y: placed.approach.y });
      reserve(reserved, placed.object);
      reserve(reserved, placed.approach);
      return;
    }
    const cell = chooseOccupiable(ctx, grid, reserved, "source");
    if (!cell) {
      placementFailures.push({ validator: "required_fixture_unplaced", detail: source.id });
      return;
    }
    grid.terrain[cell.y]![cell.x] = baseTile;
    namedPoints.push({ id: source.id, kind: "source-interact", x: cell.x, y: cell.y });
    reserve(reserved, cell);
  });

  const shops = topology.shopInstances.filter((shop) => planesEqual(shop.plane, plane));
  shops.forEach((shop, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "npcs", shop.id, index);
    const placed = chooseShopGeometry(ctx, grid, wraps, reserved);
    if (!placed) {
      placementFailures.push({ validator: "required_fixture_unplaced", detail: shop.id });
      return;
    }
    grid.terrain[placed.counter.y]![placed.counter.x] = baseTile;
    grid.terrain[placed.shopkeeper.y]![placed.shopkeeper.x] = baseTile;
    grid.terrain[placed.customer.y]![placed.customer.x] = baseTile;
    placeFeature(grid, placed.counter, "counter", "required");
    namedPoints.push({ id: `${shop.id}.counter`, kind: "counter", x: placed.counter.x, y: placed.counter.y });
    namedPoints.push({ id: `${shop.id}.shopkeeper`, kind: "shopkeeper", x: placed.shopkeeper.x, y: placed.shopkeeper.y });
    namedPoints.push({ id: `${shop.id}.customer`, kind: "customer", x: placed.customer.x, y: placed.customer.y });
    reserve(reserved, placed.counter);
    reserve(reserved, placed.shopkeeper);
    reserve(reserved, placed.customer);
  });

  const shopkeeperNpcIds = new Set(
    topology.shopInstances.filter((shop) => shop.npcInstanceId).map((shop) => shop.npcInstanceId!),
  );
  const npcs = topology.npcInstances.filter((npc) => planesEqual(npc.plane, plane) && !shopkeeperNpcIds.has(npc.id));
  npcs.forEach((npc, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "npcs", npc.id, index);
    placeOccupiableActor(ctx, grid, wraps, reserved, baseTile, namedPoints, placementFailures, npc.id, "npc", "npc");
  });

  const guardians = topology.guardianInstances.filter((guardian) => planesEqual(guardian.plane, plane));
  guardians.forEach((guardian, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "encounters", guardian.id, index);
    placeOccupiableActor(ctx, grid, wraps, reserved, baseTile, namedPoints, placementFailures, guardian.id, "guardian", "guardian");
  });

  scatterHazards(
    context(generatorVersion, worldSeed, plane, "hazards", `${planeKey(plane)}.hazards`, 0),
    grid,
    family,
    reserved,
  );

  return finalizePlaneGeometry({
    generatorVersion,
    worldSeed,
    plane,
    family,
    wraps,
    baseTile,
    grid,
    namedPoints,
    transitionFixtures,
    placementFailures,
  });
}

export function finalizePlaneGeometry(input: {
  readonly generatorVersion: string;
  readonly worldSeed: string;
  readonly plane: PlanePair;
  readonly family: FamilyId;
  readonly wraps: boolean;
  readonly baseTile: string;
  readonly grid: PlaneGrid;
  readonly namedPoints: NamedPoint[];
  readonly transitionFixtures: { transitionId: string; x: number; y: number }[];
  readonly placementFailures?: readonly PlaneValidationIssue[];
  readonly repairs?: PlaneRepairEvent[];
}): PlaneGenerationResult {
  const repairs: PlaneRepairEvent[] = [...(input.repairs ?? [])];
  const requiredPoints = interactionPoints(input.namedPoints).map((point) => ({ x: point.x, y: point.y }));
  const validationInput = () => ({
    grid: input.grid,
    wraps: input.wraps,
    family: input.family,
    plane: input.plane,
    namedPoints: input.namedPoints,
    requiredPoints,
    transitionFixtures: input.transitionFixtures,
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const issues = [...(input.placementFailures ?? []), ...validatePlaneGeometry(validationInput())];
    if (issues.length === 0) {
      break;
    }
    const applied = repairPlaneGeometry(input.grid, input.wraps, input.baseTile, requiredPoints, input.namedPoints, issues);
    repairs.push(...applied);
    if (applied.length === 0) {
      break;
    }
  }
  const issues = [...(input.placementFailures ?? []), ...validatePlaneGeometry(validationInput())];
  if (issues.length > 0) {
    return {
      ok: false,
      code: "PLANE_GEOMETRY_FAILURE",
      message: issues.map((issue) => `${issue.validator}: ${issue.detail}`).join("; "),
      issues,
      plane: input.plane,
    };
  }
  const spawnRegions = [
    { tag: "playerEntry", cells: requiredPoints.length > 0 ? [requiredPoints[0]!] : [{ x: 8, y: 8 }] },
  ];
  const planeWithoutHash = {
    generatorVersion: input.generatorVersion,
    worldSeed: input.worldSeed,
    plane: input.plane,
    family: input.family,
    wraps: input.wraps,
    terrain: input.grid.terrain.map((row) => [...row]),
    features: input.grid.features.map((row) => [...row]),
    namedPoints: [...input.namedPoints].sort((left, right) => compareCoordinates(left, right) || (left.id < right.id ? -1 : 1)),
    spawnRegions,
    transitionFixtures: [...input.transitionFixtures].sort((left, right) => compareCoordinates(left, right) || (left.transitionId < right.transitionId ? -1 : 1)),
    repairs,
  };
  return { ok: true, plane: { ...planeWithoutHash, planeHash: hashPlaneBase(planeWithoutHash) } };
}

export function familyWraps(family: FamilyId): boolean {
  return wrapsForFamily(family);
}
