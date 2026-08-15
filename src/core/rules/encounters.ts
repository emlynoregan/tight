import { CONTENT_REGISTRY } from "../data/registry";
import { allCells } from "../generation/grid";
import { isOccupiable } from "../generation/plane-occupancy";
import type { PlaneBase } from "../generation/plane-types";
import { boundedInt, chance, semantic, weightedChoice } from "../generation/semantic-random";
import type { WorldTopology } from "../generation/topology-types";
import { GLOBAL_CONSTANTS } from "../model/constants";
import { OLYMPUS_PLANE, planeKey, planesEqual } from "../model/plane";
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

function reservedCells(plane: PlaneBase): Set<string> {
  const reserved = new Set<string>();
  for (const point of plane.namedPoints) {
    reserved.add(`${point.y},${point.x}`);
  }
  for (const fixture of plane.transitionFixtures) {
    reserved.add(`${fixture.y},${fixture.x}`);
  }
  return reserved;
}

function legalEncounterCells(plane: PlaneBase, occupied: Set<string>): { x: number; y: number }[] {
  const reserved = reservedCells(plane);
  const grid = planeGrid(plane);
  return allCells().filter((cell) => {
    const key = `${cell.y},${cell.x}`;
    return isOccupiable(grid, cell) && !reserved.has(key) && !occupied.has(key);
  });
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

export function materializeOrdinaryEncounters(
  topology: WorldTopology,
  plane: PlaneBase,
  occupied: Set<string>,
  save?: SaveState,
): ActorState[] {
  const dominant = Math.max(plane.plane.a, plane.plane.b);
  const targetRange = ordinaryEncounterTarget(dominant);
  const count = boundedInt(spawnParts(topology, plane, "runtime.encounter.density", planeKey(plane.plane)), targetRange.min, targetRange.max);
  const eligible = CONTENT_REGISTRY.encounters.filter((row) => dominant >= row.tierMin && dominant <= row.tierMax);
  if (eligible.length === 0 || count <= 0 || plane.spawnRegions.length === 0) {
    return [];
  }
  const actors: ActorState[] = [];
  let cells = legalEncounterCells(plane, occupied);
  for (let index = 0; index < count; index += 1) {
    if (cells.length === 0) {
      break;
    }
    const encounter = eligible.length === 1
      ? eligible[0]!
      : weightedChoice(
          spawnParts(topology, plane, "runtime.encounter.select", `${planeKey(plane.plane)}.${index}`),
          eligible.map((row) => ({ id: row.id, weight: row.weight, value: row })),
          index,
        );
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
      for (let n = 0; n < spawnCount; n += 1) {
        if (cells.length === 0) {
          break;
        }
        const pickIndex = boundedInt(
          spawnParts(topology, plane, "runtime.encounter.cell", `${encounter.id}.${index}.${slot.monsterId}.${n}`),
          0,
          cells.length - 1,
        );
        const cell = cells[pickIndex]!;
        const actorId = `encounter.${planeKey(plane.plane)}.${encounter.id}.${index}.${slot.monsterId}.${n}`;
        cells = cells.filter((row) => row.x !== cell.x || row.y !== cell.y);
        if (alreadyPresent(save, actorId)) {
          continue;
        }
        occupied.add(`${cell.y},${cell.x}`);
        const actor = monsterActor(actorId, slot.monsterId, "monster", plane.plane, cell.x, cell.y);
        if (encounter.role === "ambush") {
          actor.ambushReleased = false;
        }
        actors.push(actor);
      }
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
