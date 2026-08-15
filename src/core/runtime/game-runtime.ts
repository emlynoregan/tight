import { CONTENT_REGISTRY } from "../data/registry";
import { STARTING_LOADOUT } from "../data/items";
import { STARTING_PLAYER_STATE } from "../data/progression";
import { getAcceptedWorld, type AcceptedWorldOptions, type AcceptedWorldSuccess, type PlaneGenerateFn } from "../generation/accepted-world";
import { canonicalizeValue } from "../generation/canonical";
import type { PlaneBase } from "../generation/plane-types";
import { bytesToHex, sha256 } from "../generation/sha256";
import type { WorldTopology } from "../generation/topology-types";
import { GLOBAL_CONSTANTS } from "../model/constants";
import type { GeneratorVersionId } from "../model/ids";
import { planeKey, planesEqual, STARTING_PLANE, type MapCoordinate, type PlanePair } from "../model/plane";
import { defaultAiFields, type ActorState, type EquipmentLoadout, type IntentionalAction, type PendingPlayerTransition, type SaveState } from "../model/save-state";
import { scaledMonster } from "../rules/actor-stats";
import { materializeOlympusBoss, materializeOrdinaryEncounters, materializeShopkeepers } from "../rules/encounters";
import { materializeRuntimePlane } from "./materialize-plane";

export function maxHpForCon(con: number): number {
  return GLOBAL_CONSTANTS.baseHpConstant + GLOBAL_CONSTANTS.hpPerCon * con;
}

export interface GameRuntime {
  readonly identity: { readonly generatorVersion: GeneratorVersionId; readonly worldSeed: string };
  readonly world: AcceptedWorldSuccess;
  topology: WorldTopology;
  readonly content: typeof CONTENT_REGISTRY;
  save: SaveState;
  currentPlaneBase: PlaneBase;
  omittedFixtureIds: readonly string[];
  scriptedActions: Map<string, IntentionalAction>;
  planeCache: Map<string, PlaneBase>;
  generatePlane?: PlaneGenerateFn;
  pendingPlayerTransition: PendingPlayerTransition | null;
}

export interface CreateNewGameOptions extends AcceptedWorldOptions {
  readonly materializePlane?: PlaneGenerateFn;
}

function emptyEquipment(): EquipmentLoadout {
  return {
    weapon: STARTING_LOADOUT.equippedWeapon,
    offhand: null,
    body: STARTING_LOADOUT.equippedBody,
    head: null,
    charm: null,
    artefact: null,
  };
}

function playerSpawn(plane: PlaneBase): MapCoordinate {
  const namedEntry = plane.namedPoints.find((point) => point.kind === "playerEntry");
  if (namedEntry) {
    return { x: namedEntry.x, y: namedEntry.y };
  }
  const region = plane.spawnRegions.find((row) => row.tag === "playerEntry");
  if (region && region.cells[0]) {
    return { x: region.cells[0].x, y: region.cells[0].y };
  }
  const approach = plane.namedPoints.find((point) => point.id === "safe_anchor.approach");
  if (approach) {
    return { x: approach.x, y: approach.y };
  }
  throw new Error(`no player spawn on ${plane.plane.a},${plane.plane.b}`);
}

function actorAtPoint(
  id: string,
  definitionId: string,
  kind: ActorState["kind"],
  plane: PlanePair,
  point: MapCoordinate | undefined,
): ActorState | null {
  if (!point) {
    return null;
  }
  const species = CONTENT_REGISTRY.byId.monster.get(definitionId);
  const scaled = species ? scaledMonster(species, plane) : null;
  const maxHp = scaled?.maxHp ?? maxHpForCon(GLOBAL_CONSTANTS.playerStartingAttribute);
  const spd = scaled?.attributes.spd ?? GLOBAL_CONSTANTS.playerStartingAttribute;
  return {
    id,
    definitionId,
    kind,
    plane,
    x: point.x,
    y: point.y,
    hp: maxHp,
    maxHp,
    spd,
    initiativeModifier: 0,
    blocking: true,
    statuses: [],
    cooldowns: [],
    ...defaultAiFields(point.x, point.y),
  };
}

export function materializeNonPlayerActors(
  topology: WorldTopology,
  planeBase: PlaneBase,
  occupied: Set<string> = new Set(),
  save?: SaveState,
): ActorState[] {
  const actors: ActorState[] = [];
  const points = new Map(planeBase.namedPoints.map((point) => [point.id, point]));
  const shopkeeperNpcIds = new Set(
    topology.shopInstances.filter((shop) => shop.npcInstanceId).map((shop) => shop.npcInstanceId!),
  );
  for (const npc of topology.npcInstances) {
    if (!planesEqual(npc.plane, planeBase.plane) || shopkeeperNpcIds.has(npc.id)) {
      continue;
    }
    if (save?.flags.includes(`defeated:${npc.id}`) || save?.actors.some((row) => row.id === npc.id)) {
      continue;
    }
    const actor = actorAtPoint(npc.id, npc.npcId, "npc", npc.plane, points.get(npc.id));
    if (!actor || occupied.has(`${actor.y},${actor.x}`)) {
      continue;
    }
    occupied.add(`${actor.y},${actor.x}`);
    actors.push(actor);
  }
  for (const guardian of topology.guardianInstances) {
    if (!planesEqual(guardian.plane, planeBase.plane)) {
      continue;
    }
    if (save?.flags.includes(`defeated:${guardian.id}`) || save?.actors.some((row) => row.id === guardian.id)) {
      continue;
    }
    const actor = actorAtPoint(guardian.id, guardian.monsterId, "guardian", guardian.plane, points.get(guardian.id));
    if (!actor || occupied.has(`${actor.y},${actor.x}`)) {
      continue;
    }
    occupied.add(`${actor.y},${actor.x}`);
    actors.push(actor);
  }
  actors.push(...materializeShopkeepers(topology, planeBase, occupied, save));
  actors.push(...materializeOlympusBoss(topology, planeBase, occupied, save));
  actors.push(...materializeOrdinaryEncounters(topology, planeBase, occupied, save));
  return actors;
}

export function materializeActors(topology: WorldTopology, planeBase: PlaneBase, player: ActorState): ActorState[] {
  const occupied = new Set([`${player.y},${player.x}`]);
  return [player, ...materializeNonPlayerActors(topology, planeBase, occupied)];
}

export function createRuntimeFromAccepted(
  world: AcceptedWorldSuccess,
  planeBase: PlaneBase,
  omittedFixtureIds: readonly string[] = [],
  generatePlane?: PlaneGenerateFn,
): GameRuntime {
  const spawn = playerSpawn(planeBase);
  const maxHp = maxHpForCon(STARTING_PLAYER_STATE.attributes.con);
  const anchor = planeBase.namedPoints.find((point) => point.id === "safe_anchor" && point.kind === "anchor");
  const playerActor: ActorState = {
    id: "player",
    definitionId: "player",
    kind: "player",
    plane: planeBase.plane,
    x: spawn.x,
    y: spawn.y,
    hp: STARTING_PLAYER_STATE.currentHp,
    maxHp,
    spd: STARTING_PLAYER_STATE.attributes.spd,
    initiativeModifier: 0,
    blocking: true,
    statuses: [],
    cooldowns: [],
    ...defaultAiFields(spawn.x, spawn.y),
  };
  const save: SaveState = {
    generatorVersion: world.topology.generatorVersion,
    worldSeed: world.topology.worldSeed,
    topologyHash: world.topologyHash,
    tick: 0,
    plane: planeBase.plane,
    family: planeBase.family,
    discoveredDimensions: [...STARTING_PLAYER_STATE.discoveredDimensions],
    discoveredPlanes: STARTING_PLAYER_STATE.discoveredPlanes.map((plane) => ({ ...plane })),
    modal: null,
    heldDirection: null,
    heldDirectionChanged: false,
    actionQueue: [],
    player: {
      attributes: { ...STARTING_PLAYER_STATE.attributes },
      unspentAp: STARTING_PLAYER_STATE.unspentAp,
      currency: STARTING_PLAYER_STATE.currency,
      equipment: emptyEquipment(),
      inventory: STARTING_LOADOUT.inventory.map((stack) => ({ ...stack })),
      keyItems: [],
      learnedAbilities: [...STARTING_PLAYER_STATE.learnedAbilities],
      safeAnchor: { plane: planeBase.plane, x: (anchor ?? spawn).x, y: (anchor ?? spawn).y },
    },
    actors: materializeActors(world.topology, planeBase, playerActor),
    flags: [],
    featureStates: [],
    groundItems: [],
    collectedSources: [],
    quests: [],
    awardedApEvents: [],
    pursuits: [],
    consumedTransitionIds: [],
    lastTransition: null,
  };
  return {
    identity: { generatorVersion: world.topology.generatorVersion, worldSeed: world.topology.worldSeed },
    world,
    topology: world.topology,
    content: CONTENT_REGISTRY,
    save,
    currentPlaneBase: planeBase,
    omittedFixtureIds,
    scriptedActions: new Map(),
    planeCache: new Map([[planeKey(planeBase.plane), planeBase]]),
    pendingPlayerTransition: null,
    ...(generatePlane ? { generatePlane } : {}),
  };
}

export function createNewGame(version: string, seed: string, options: CreateNewGameOptions = {}): GameRuntime {
  const world = getAcceptedWorld(version, seed, options);
  if (!world.ok) {
    throw new Error(`cannot create New Game: ${world.code}: ${world.message}`);
  }
  const generate = options.materializePlane ?? options.generatePlane;
  const materialized = materializeRuntimePlane(world, STARTING_PLANE, generate);
  if (!materialized.ok) {
    throw new Error(`starting plane unrealizable: ${materialized.message}`);
  }
  return createRuntimeFromAccepted(world, materialized.plane, materialized.omittedFixtureIds, generate);
}

export function hashSaveState(save: SaveState): string {
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonicalizeValue(save)))));
}

export function playerActor(runtime: GameRuntime): ActorState {
  const actor = runtime.save.actors.find((row) => row.id === "player");
  if (!actor) {
    throw new Error("player actor missing from save");
  }
  return actor;
}

export function createMonsterActor(
  id: string,
  speciesId: string,
  plane: PlanePair,
  x: number,
  y: number,
): ActorState {
  const species = CONTENT_REGISTRY.byId.monster.get(speciesId);
  if (!species) {
    throw new Error(`unknown monster ${speciesId}`);
  }
  const scaled = scaledMonster(species, plane);
  return {
    id,
    definitionId: speciesId,
    kind: "monster",
    plane,
    x,
    y,
    hp: scaled.maxHp,
    maxHp: scaled.maxHp,
    spd: scaled.attributes.spd,
    initiativeModifier: 0,
    blocking: true,
    statuses: [],
    cooldowns: [],
    ...defaultAiFields(x, y),
  };
}
