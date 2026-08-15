import { CONTENT_REGISTRY } from "../data/registry";
import { familyForDimension } from "../data/dimensions";
import { allCells, chebyshev, manhattan, ORTHOGONAL } from "../generation/grid";
import { isOccupiable } from "../generation/plane-occupancy";
import type { PlaneBase } from "../generation/plane-types";
import { boundedInt, chance, semantic, weightedChoice, type SemanticPart } from "../generation/semantic-random";
import type { WorldTopology } from "../generation/topology-types";
import type { EncounterDefinition } from "../model/content-types";
import { GLOBAL_CONSTANTS } from "../model/constants";
import { compareCoordinates, MAP_SIZE, OLYMPUS_PLANE, planeKey, planesEqual, type MapCoordinate } from "../model/plane";
import { defaultAiFields, type ActorState, type SaveState } from "../model/save-state";
import { scaledMonster } from "./actor-stats";
import { planeGrid } from "./occupancy";

function ordinaryEncounterTarget(dominant: number): { min: number; max: number } {
  if (dominant <= 3) {
    return { min: 1, max: 2 };
  }
  if (dominant <= 11) {
    return { min: 2, max: 3 };
  }
  return { min: 2, max: 4 };
}

function cellKey(cell: MapCoordinate): string {
  return `${cell.y},${cell.x}`;
}

function spawnParts(topology: WorldTopology, plane: PlaneBase, purpose: string, subject: string) {
  return [
    semantic.string(topology.generatorVersion),
    semantic.string(topology.worldSeed),
    semantic.i64(topology.topologyAttempt),
    semantic.plane(plane.plane),
    semantic.string(purpose),
    semantic.string(subject),
  ];
}

function walkable(plane: PlaneBase, cell: MapCoordinate): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x >= MAP_SIZE || cell.y >= MAP_SIZE) {
    return false;
  }
  return isOccupiable(planeGrid(plane), cell);
}

function tileTags(plane: PlaneBase, cell: MapCoordinate): readonly string[] {
  const tileId = plane.terrain[cell.y]?.[cell.x];
  return tileId ? (CONTENT_REGISTRY.byId.tile.get(tileId)?.tags ?? []) : [];
}

function cellMatchesTerrain(plane: PlaneBase, cell: MapCoordinate, encounter: EncounterDefinition): boolean {
  const tags = tileTags(plane, cell);
  if (encounter.requiredTerrainTags.some((tag) => !tags.includes(tag))) {
    return false;
  }
  return !encounter.forbiddenTerrainTags.some((tag) => tags.includes(tag));
}

function losBlocked(plane: PlaneBase, cell: MapCoordinate): boolean {
  const tileId = plane.terrain[cell.y]?.[cell.x];
  const tile = tileId ? CONTENT_REGISTRY.byId.tile.get(tileId) : undefined;
  if (tile?.blocksLos === true) {
    return true;
  }
  const featureId = plane.features[cell.y]?.[cell.x];
  const feature = featureId ? CONTENT_REGISTRY.byId.feature.get(featureId) : undefined;
  return feature?.blocksLos === true;
}

function playerEntryCells(plane: PlaneBase): MapCoordinate[] {
  const cells: MapCoordinate[] = [];
  for (const region of plane.spawnRegions) {
    if (region.tag === "playerEntry") {
      cells.push(...region.cells);
    }
  }
  for (const point of plane.namedPoints) {
    if (point.kind === "playerEntry") {
      cells.push({ x: point.x, y: point.y });
    }
  }
  if (cells.length === 0) {
    const approach = plane.namedPoints.find((point) => point.id === "safe_anchor.approach");
    if (approach) {
      cells.push({ x: approach.x, y: approach.y });
    }
  }
  return cells;
}

function transitionCells(plane: PlaneBase): MapCoordinate[] {
  const cells: MapCoordinate[] = plane.transitionFixtures.map((row) => ({ x: row.x, y: row.y }));
  for (const point of plane.namedPoints) {
    if (point.kind === "transition") {
      cells.push({ x: point.x, y: point.y });
    }
  }
  for (const cell of allCells()) {
    if (plane.features[cell.y]?.[cell.x] === "transition_fixture") {
      cells.push(cell);
    }
  }
  return cells;
}

function reservedCells(plane: PlaneBase): Set<string> {
  const reserved = new Set<string>();
  for (const point of plane.namedPoints) {
    reserved.add(cellKey(point));
  }
  for (const fixture of plane.transitionFixtures) {
    reserved.add(cellKey(fixture));
  }
  return reserved;
}

function uniqueCells(cells: readonly MapCoordinate[]): MapCoordinate[] {
  const seen = new Set<string>();
  const unique: MapCoordinate[] = [];
  for (const cell of cells) {
    const key = cellKey(cell);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(cell);
  }
  return unique;
}

function farFromEntry(cell: MapCoordinate, entries: readonly MapCoordinate[]): boolean {
  if (entries.length === 0) {
    return true;
  }
  return entries.every((entry) => manhattan(cell, entry) >= 2);
}

function legalPatternCells(
  plane: PlaneBase,
  occupied: Set<string>,
  encounter: EncounterDefinition,
  allowTransitionAdjacent: boolean,
): MapCoordinate[] {
  const reserved = reservedCells(plane);
  const entries = playerEntryCells(plane);
  const transitions = new Set(transitionCells(plane).map(cellKey));
  return allCells().filter((cell) => {
    const key = cellKey(cell);
    if (!walkable(plane, cell) || reserved.has(key) || occupied.has(key)) {
      return false;
    }
    if (!cellMatchesTerrain(plane, cell, encounter)) {
      return false;
    }
    if (!farFromEntry(cell, entries)) {
      return false;
    }
    if (transitions.has(key) && !allowTransitionAdjacent) {
      return false;
    }
    return true;
  });
}

function orthogonalOf(cell: MapCoordinate): MapCoordinate[] {
  return ORTHOGONAL.map((delta) => ({ x: cell.x + delta.x, y: cell.y + delta.y })).filter(
    (row) => row.x >= 0 && row.x < MAP_SIZE && row.y >= 0 && row.y < MAP_SIZE,
  );
}

function isCorridorCell(plane: PlaneBase, cell: MapCoordinate): boolean {
  if (!walkable(plane, cell)) {
    return false;
  }
  const north = walkable(plane, { x: cell.x, y: cell.y - 1 });
  const south = walkable(plane, { x: cell.x, y: cell.y + 1 });
  const east = walkable(plane, { x: cell.x + 1, y: cell.y });
  const west = walkable(plane, { x: cell.x - 1, y: cell.y });
  const vertical = north && south && !east && !west;
  const horizontal = east && west && !north && !south;
  return vertical || horizontal;
}

function isHiddenEdgeCell(plane: PlaneBase, cell: MapCoordinate): boolean {
  const onEdge = cell.x === 0 || cell.y === 0 || cell.x === MAP_SIZE - 1 || cell.y === MAP_SIZE - 1;
  if (!plane.wraps && onEdge) {
    return true;
  }
  return orthogonalOf(cell).some((neighbour) => !walkable(plane, neighbour) || losBlocked(plane, neighbour));
}

function connectedComponents(cells: readonly MapCoordinate[]): MapCoordinate[][] {
  const remaining = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const blobs: MapCoordinate[][] = [];
  while (remaining.size > 0) {
    const start = remaining.values().next().value!;
    const blob: MapCoordinate[] = [];
    const queue = [start];
    remaining.delete(cellKey(start));
    while (queue.length > 0) {
      const cell = queue.pop()!;
      blob.push(cell);
      for (const neighbour of orthogonalOf(cell)) {
        const key = cellKey(neighbour);
        if (!remaining.has(key)) {
          continue;
        }
        remaining.delete(key);
        queue.push(neighbour);
      }
    }
    blobs.push(blob.sort(compareCoordinates));
  }
  return blobs.sort((left, right) => compareCoordinates(left[0]!, right[0]!));
}

function pickIndex(parts: readonly SemanticPart[], count: number, ordinal: number): number {
  if (count <= 1) {
    return 0;
  }
  return boundedInt(parts, 0, count - 1, ordinal);
}

function withSubject(parts: readonly SemanticPart[], subject: string): SemanticPart[] {
  return [...parts.slice(0, -1), semantic.string(subject)];
}

function takeSeparated(
  candidates: MapCoordinate[],
  count: number,
  parts: readonly SemanticPart[],
  subject: string,
  minSeparation: number,
  allowPackedFallback: boolean,
): MapCoordinate[] | null {
  const remaining = [...candidates].sort(compareCoordinates);
  const chosen: MapCoordinate[] = [];
  for (let index = 0; index < count; index += 1) {
    const preferred = remaining.filter((cell) => chosen.every((row) => chebyshev(cell, row) >= minSeparation));
    const pool = preferred.length > 0 ? preferred : allowPackedFallback ? remaining : [];
    if (pool.length === 0) {
      return null;
    }
    const pick = pool[pickIndex(withSubject(parts, `${subject}.${index}`), pool.length, index)]!;
    chosen.push(pick);
    const key = cellKey(pick);
    const drop = remaining.findIndex((row) => cellKey(row) === key);
    if (drop >= 0) {
      remaining.splice(drop, 1);
    }
  }
  return chosen;
}

function consecutiveRuns(cells: readonly MapCoordinate[], axis: "x" | "y"): MapCoordinate[][] {
  const groups = new Map<number, MapCoordinate[]>();
  for (const cell of cells) {
    const key = axis === "x" ? cell.y : cell.x;
    const group = groups.get(key) ?? [];
    group.push(cell);
    groups.set(key, group);
  }
  const runs: MapCoordinate[][] = [];
  for (const group of [...groups.values()].map((row) => row.sort(compareCoordinates))) {
    let current: MapCoordinate[] = [];
    for (const cell of group) {
      const previous = current[current.length - 1];
      const adjacent = previous
        ? axis === "x"
          ? cell.x === previous.x + 1 && cell.y === previous.y
          : cell.y === previous.y + 1 && cell.x === previous.x
        : false;
      if (!previous || adjacent) {
        current.push(cell);
      } else {
        if (current.length > 0) {
          runs.push(current);
        }
        current = [cell];
      }
    }
    if (current.length > 0) {
      runs.push(current);
    }
  }
  return runs;
}

function takeRun(runs: MapCoordinate[][], count: number, parts: readonly SemanticPart[], subject: string): MapCoordinate[] | null {
  const windows: MapCoordinate[][] = [];
  for (const run of runs) {
    if (run.length < count) {
      continue;
    }
    for (let start = 0; start <= run.length - count; start += 1) {
      windows.push(run.slice(start, start + count));
    }
  }
  if (windows.length === 0) {
    return null;
  }
  return windows[pickIndex(withSubject(parts, subject), windows.length, 0)]!;
}

function surroundAnchors(plane: PlaneBase): MapCoordinate[] {
  const anchors: MapCoordinate[] = [];
  for (const cell of allCells()) {
    const feature = plane.features[cell.y]?.[cell.x];
    if (feature === "container_chest" || feature === "container_cache" || feature === "door" || feature === "transition_fixture") {
      anchors.push(cell);
    }
  }
  for (const fixture of plane.transitionFixtures) {
    anchors.push({ x: fixture.x, y: fixture.y });
  }
  return uniqueCells(anchors).sort(compareCoordinates);
}

export function encounterEligibleForPlane(encounter: EncounterDefinition, plane: PlaneBase): boolean {
  const dominant = Math.max(plane.plane.a, plane.plane.b);
  if (dominant < encounter.tierMin || dominant > encounter.tierMax) {
    return false;
  }
  if (encounter.pattern === "fixed_stamp") {
    return false;
  }
  const familyA = familyForDimension(plane.plane.a);
  const familyB = familyForDimension(plane.plane.b);
  if (encounter.pureFamilyOnly && familyA !== familyB) {
    return false;
  }
  if (
    encounter.eligibleFamilies.length > 0 &&
    !encounter.eligibleFamilies.includes(familyA) &&
    !encounter.eligibleFamilies.includes(familyB)
  ) {
    return false;
  }
  if (encounter.requiredTerrainTags.length > 0) {
    const found = allCells().some((cell) => walkable(plane, cell) && cellMatchesTerrain(plane, cell, encounter));
    if (!found) {
      return false;
    }
  }
  return true;
}

export function cellsForEncounterPattern(
  plane: PlaneBase,
  occupied: Set<string>,
  encounter: EncounterDefinition,
  count: number,
  parts: readonly SemanticPart[],
): MapCoordinate[] | null {
  if (count <= 0) {
    return [];
  }
  if (encounter.pattern === "fixed_stamp") {
    return null;
  }
  const guardDoor = encounter.pattern === "guard_door";
  const legal = legalPatternCells(plane, occupied, encounter, false);
  if (encounter.pattern === "scatter") {
    return takeSeparated(legal, count, parts, `${encounter.id}.scatter`, 2, true);
  }
  if (encounter.pattern === "cluster") {
    if (legal.length < count) {
      return null;
    }
    const centre = legal[pickIndex(withSubject(parts, `${encounter.id}.centre`), legal.length, 0)]!;
    const nearby = legal
      .filter((cell) => chebyshev(cell, centre) <= 2)
      .sort((left, right) => chebyshev(left, centre) - chebyshev(right, centre) || compareCoordinates(left, right));
    if (nearby.length < count) {
      return null;
    }
    return nearby.slice(0, count);
  }
  if (encounter.pattern === "line") {
    const line = takeRun(consecutiveRuns(legal, "x"), count, parts, `${encounter.id}.line.x`)
      ?? takeRun(consecutiveRuns(legal, "y"), count, parts, `${encounter.id}.line.y`);
    if (line) {
      return line;
    }
    const corridor = legal.filter((cell) => isCorridorCell(plane, cell));
    return takeRun(consecutiveRuns(corridor, "x"), count, parts, `${encounter.id}.line.corridor.x`)
      ?? takeRun(consecutiveRuns(corridor, "y"), count, parts, `${encounter.id}.line.corridor.y`);
  }
  if (encounter.pattern === "surround") {
    for (const anchor of surroundAnchors(plane)) {
      const ring = uniqueCells(
        [...orthogonalOf(anchor), ...[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: anchor.x + dx, y: anchor.y + dy })))]
          .filter((cell) => cell.x >= 0 && cell.x < MAP_SIZE && cell.y >= 0 && cell.y < MAP_SIZE)
          .filter((cell) => !(cell.x === anchor.x && cell.y === anchor.y)),
      ).filter((cell) => legal.some((row) => row.x === cell.x && row.y === cell.y));
      const picked = takeSeparated(ring.sort(compareCoordinates), count, parts, `${encounter.id}.surround.${cellKey(anchor)}`, 1, true);
      if (picked) {
        return picked;
      }
    }
    return null;
  }
  if (guardDoor) {
    const posts: MapCoordinate[] = [];
    for (const fixture of uniqueCells(transitionCells(plane))) {
      for (const neighbour of orthogonalOf(fixture)) {
        if (legal.some((row) => row.x === neighbour.x && row.y === neighbour.y) || (
          walkable(plane, neighbour)
          && !occupied.has(cellKey(neighbour))
          && !reservedCells(plane).has(cellKey(neighbour))
          && cellMatchesTerrain(plane, neighbour, encounter)
          && farFromEntry(neighbour, playerEntryCells(plane))
        )) {
          posts.push(neighbour);
        }
      }
    }
    return takeSeparated(uniqueCells(posts).sort(compareCoordinates), count, parts, `${encounter.id}.guard`, 1, true);
  }
  if (encounter.pattern === "room") {
    const roomCells = legal.filter((cell) => !isCorridorCell(plane, cell));
    const rooms = connectedComponents(roomCells).filter((blob) => blob.length >= count);
    const blobs = rooms.length > 0 ? rooms : connectedComponents(legal).filter((blob) => blob.length >= count);
    if (blobs.length === 0) {
      return null;
    }
    const room = blobs[pickIndex(withSubject(parts, `${encounter.id}.room`), blobs.length, 0)]!;
    return takeSeparated(room, count, parts, `${encounter.id}.room.cells`, 1, true);
  }
  if (encounter.pattern === "corridor") {
    const corridor = legal.filter((cell) => isCorridorCell(plane, cell));
    return takeRun(consecutiveRuns(corridor, "x"), count, parts, `${encounter.id}.corridor.x`)
      ?? takeRun(consecutiveRuns(corridor, "y"), count, parts, `${encounter.id}.corridor.y`)
      ?? takeSeparated(corridor, count, parts, `${encounter.id}.corridor`, 1, false);
  }
  if (encounter.pattern === "hidden_edge") {
    const hidden = legal.filter((cell) => isHiddenEdgeCell(plane, cell));
    return takeSeparated(hidden, count, parts, `${encounter.id}.hidden`, 1, true);
  }
  return takeSeparated(legal, count, parts, `${encounter.id}.fallback`, 2, false);
}

function monsterActor(
  id: string,
  speciesId: string,
  kind: ActorState["kind"],
  plane: PlaneBase["plane"],
  x: number,
  y: number,
): ActorState {
  const species = CONTENT_REGISTRY.byId.monster.get(speciesId);
  const scaled = species ? scaledMonster(species, plane) : null;
  const maxHp = scaled?.maxHp ?? GLOBAL_CONSTANTS.baseHpConstant + GLOBAL_CONSTANTS.hpPerCon * GLOBAL_CONSTANTS.playerStartingAttribute;
  return {
    id,
    definitionId: speciesId,
    kind,
    plane,
    x,
    y,
    hp: maxHp,
    maxHp,
    spd: scaled?.attributes.spd ?? GLOBAL_CONSTANTS.playerStartingAttribute,
    initiativeModifier: 0,
    blocking: true,
    statuses: [],
    cooldowns: [],
    ...defaultAiFields(x, y),
  };
}

function alreadyPresent(save: SaveState | undefined, id: string): boolean {
  return Boolean(save?.flags.includes(`defeated:${id}`) || save?.actors.some((actor) => actor.id === id));
}

export function materializeOlympusBoss(topology: WorldTopology, plane: PlaneBase, occupied: Set<string>, save?: SaveState): ActorState[] {
  if (!planesEqual(plane.plane, OLYMPUS_PLANE)) {
    return [];
  }
  const id = `boss.${topology.olympusBossInstance.encounterId}`;
  if (alreadyPresent(save, id)) {
    return [];
  }
  const point = plane.namedPoints.find((row) => row.id === "olympus.bossSpawn" || row.kind === "bossSpawn");
  if (!point || occupied.has(`${point.y},${point.x}`)) {
    return [];
  }
  occupied.add(`${point.y},${point.x}`);
  return [monsterActor(id, topology.olympusBossInstance.monsterId, "guardian", plane.plane, point.x, point.y)];
}

function plannedSpawns(
  topology: WorldTopology,
  plane: PlaneBase,
  encounter: EncounterDefinition,
  index: number,
): { monsterId: string; n: number }[] {
  const planned: { monsterId: string; n: number }[] = [];
  for (const slot of encounter.slots) {
    const includeOptional = !slot.optional || chance(spawnParts(topology, plane, "runtime.encounter.optional", `${encounter.id}.${index}.${slot.monsterId}`), 50);
    if (!includeOptional) {
      continue;
    }
    const spawnCount = boundedInt(
      spawnParts(topology, plane, "runtime.encounter.count", `${encounter.id}.${index}.${slot.monsterId}`),
      slot.min,
      slot.max,
    );
    if (spawnCount > 0) {
      planned.push({ monsterId: slot.monsterId, n: spawnCount });
    }
  }
  return planned;
}

export function materializeOrdinaryEncounters(
  topology: WorldTopology,
  plane: PlaneBase,
  occupied: Set<string>,
  save?: SaveState,
): ActorState[] {
  const dominant = Math.max(plane.plane.a, plane.plane.b);
  const targetRange = ordinaryEncounterTarget(dominant);
  const count = boundedInt(spawnParts(topology, plane, "runtime.encounter.density", planeKey(plane.plane)), targetRange.min, targetRange.max);
  if (count <= 0 || plane.spawnRegions.length === 0) {
    return [];
  }
  const actors: ActorState[] = [];
  for (let index = 0; index < count; index += 1) {
    const remaining = CONTENT_REGISTRY.encounters.filter((row) => encounterEligibleForPlane(row, plane));
    let placed = false;
    let attempt = 0;
    while (remaining.length > 0 && !placed) {
      const encounter = remaining.length === 1
        ? remaining[0]!
        : weightedChoice(
            spawnParts(topology, plane, "runtime.encounter.select", `${planeKey(plane.plane)}.${index}.${attempt}`),
            remaining.map((row) => ({ id: row.id, weight: row.weight, value: row })),
            attempt,
          );
      const planned = plannedSpawns(topology, plane, encounter, index);
      const total = planned.reduce((sum, row) => sum + row.n, 0);
      const cells = total === 0
        ? []
        : cellsForEncounterPattern(plane, occupied, encounter, total, spawnParts(topology, plane, "runtime.encounter.place", `${encounter.id}.${index}`));
      if (cells === null) {
        const drop = remaining.findIndex((row) => row.id === encounter.id);
        if (drop >= 0) {
          remaining.splice(drop, 1);
        }
        attempt += 1;
        continue;
      }
      let cursor = 0;
      for (const slot of planned) {
        for (let n = 0; n < slot.n; n += 1) {
          const cell = cells[cursor];
          cursor += 1;
          if (!cell) {
            continue;
          }
          const actorId = `encounter.${planeKey(plane.plane)}.${encounter.id}.${index}.${slot.monsterId}.${n}`;
          occupied.add(cellKey(cell));
          if (alreadyPresent(save, actorId)) {
            continue;
          }
          const actor = monsterActor(actorId, slot.monsterId, "monster", plane.plane, cell.x, cell.y);
          if (encounter.role === "ambush") {
            actor.ambushReleased = false;
          }
          actors.push(actor);
        }
      }
      placed = true;
    }
  }
  return actors;
}

export function materializeShopkeepers(
  topology: WorldTopology,
  plane: PlaneBase,
  occupied: Set<string>,
  save?: SaveState,
): ActorState[] {
  const actors: ActorState[] = [];
  const points = new Map(plane.namedPoints.map((point) => [point.id, point]));
  for (const shop of topology.shopInstances) {
    if (!planesEqual(shop.plane, plane.plane)) {
      continue;
    }
    const point = points.get(`${shop.id}.shopkeeper`);
    if (!point || occupied.has(`${point.y},${point.x}`)) {
      continue;
    }
    const npc = shop.npcInstanceId ? topology.npcInstances.find((row) => row.id === shop.npcInstanceId) : undefined;
    const actorId = shop.npcInstanceId ?? `${shop.id}.shopkeeper`;
    if (alreadyPresent(save, actorId)) {
      continue;
    }
    occupied.add(`${point.y},${point.x}`);
    const definitionId = npc?.npcId ?? "shopkeeper";
    const maxHp = GLOBAL_CONSTANTS.baseHpConstant + GLOBAL_CONSTANTS.hpPerCon * GLOBAL_CONSTANTS.playerStartingAttribute;
    actors.push({
      id: actorId,
      definitionId,
      kind: "npc",
      plane: shop.plane,
      x: point.x,
      y: point.y,
      hp: maxHp,
      maxHp,
      spd: GLOBAL_CONSTANTS.playerStartingAttribute,
      initiativeModifier: 0,
      blocking: true,
      statuses: [],
      cooldowns: [],
      ...defaultAiFields(point.x, point.y),
    });
  }
  return actors;
}
