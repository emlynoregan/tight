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
import { allCells, emptyGrid } from "./grid";
import {
  generateBlob,
  generateRectangle,
  generateStamp,
  primitiveParts,
  type StampMatrix,
} from "./geometry-primitives";
import { isOccupiable } from "./plane-occupancy";
import { repairPlaneGeometry } from "./plane-repair";
import type { NamedPoint, PlaneBase, PlaneGrid, PlaneRepairEvent, PrimitiveContext } from "./plane-types";
import { validatePlaneGeometry } from "./plane-validate";
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

function chooseOccupiable(ctx: PrimitiveContext, grid: PlaneGrid, tag: string): MapCoordinate | null {
  const cells = allCells().filter((cell) => isOccupiable(grid, cell));
  if (cells.length === 0) {
    return null;
  }
  const sorted = [...cells].sort(compareCoordinates);
  const index = boundedInt(primitiveParts(ctx, tag), 0, sorted.length - 1);
  return sorted[index]!;
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
): PlaneBase {
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
  const repairs: PlaneRepairEvent[] = [];

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
        const approach = stamp.namedPoints.approach ?? { x: anchor.x, y: Math.min(MAP_SIZE - 1, anchor.y + 1) };
        grid.terrain[approach.y]![approach.x] = baseTile;
        namedPoints.push({ id: "safe_anchor.approach", kind: "approach", x: approach.x, y: approach.y });
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
      }
    }
  }

  const transitions = topology.transitions.filter(
    (row) => planesEqual(row.sourcePlane, plane) || planesEqual(row.destinationPlane, plane),
  );
  transitions.forEach((transition, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "transitions", transition.id, index);
    const cell = chooseOccupiable(ctx, grid, "fixture") ?? allCells()[0]!;
    grid.terrain[cell.y]![cell.x] = baseTile;
    placeFeature(grid, cell, "transition_fixture", "required");
    transitionFixtures.push({ transitionId: transition.id, x: cell.x, y: cell.y });
    namedPoints.push({ id: `transition.${transition.id}`, kind: "transition", x: cell.x, y: cell.y });
  });

  const sources = topology.progressionSources.filter((source) => planesEqual(source.plane, plane));
  sources.forEach((source, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "items", source.id, index);
    const cell = chooseOccupiable(ctx, grid, "source") ?? allCells()[0]!;
    grid.terrain[cell.y]![cell.x] = baseTile;
    if (source.sourceType === "container" || source.sourceType === "fixed_item") {
      placeFeature(grid, cell, "container_chest", "required");
    }
    namedPoints.push({ id: source.id, kind: "source", x: cell.x, y: cell.y });
  });

  const shops = topology.shopInstances.filter((shop) => planesEqual(shop.plane, plane));
  shops.forEach((shop, index) => {
    const ctx = context(generatorVersion, worldSeed, plane, "npcs", shop.id, index);
    const cell = chooseOccupiable(ctx, grid, "shop") ?? allCells()[0]!;
    grid.terrain[cell.y]![cell.x] = baseTile;
    placeFeature(grid, cell, "counter", "required");
    namedPoints.push({ id: shop.id, kind: "shop", x: cell.x, y: cell.y });
  });

  const requiredPoints = namedPoints
    .filter((point) => point.kind !== "anchor")
    .map((point) => ({ x: point.x, y: point.y }));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const issues = validatePlaneGeometry({
      grid,
      wraps,
      family,
      namedPoints,
      requiredPoints,
      transitionFixtures,
    });
    if (issues.length === 0) {
      break;
    }
    const applied = repairPlaneGeometry(grid, wraps, baseTile, requiredPoints, namedPoints, issues);
    repairs.push(...applied);
    if (applied.length === 0) {
      break;
    }
  }

  const spawnRegions = [
    { tag: "playerEntry", cells: requiredPoints.length > 0 ? [requiredPoints[0]!] : [{ x: 8, y: 8 }] },
  ];
  const planeWithoutHash = {
    generatorVersion,
    worldSeed,
    plane,
    family,
    wraps,
    terrain: grid.terrain.map((row) => [...row]),
    features: grid.features.map((row) => [...row]),
    namedPoints: [...namedPoints].sort((left, right) => compareCoordinates(left, right) || (left.id < right.id ? -1 : 1)),
    spawnRegions,
    transitionFixtures: [...transitionFixtures].sort((left, right) => compareCoordinates(left, right) || (left.transitionId < right.transitionId ? -1 : 1)),
    repairs,
  };
  return { ...planeWithoutHash, planeHash: hashPlaneBase(planeWithoutHash) };
}

export function familyWraps(family: FamilyId): boolean {
  return wrapsForFamily(family);
}
