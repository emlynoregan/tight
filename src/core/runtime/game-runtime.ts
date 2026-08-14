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
import { planesEqual, STARTING_PLANE, type MapCoordinate, type PlanePair } from "../model/plane";
import type { ActorState, EquipmentLoadout, SaveState } from "../model/save-state";
import { materializeRuntimePlane } from "./materialize-plane";

export function maxHpForCon(con: number): number {
  return GLOBAL_CONSTANTS.baseHpConstant + GLOBAL_CONSTANTS.hpPerCon * con;
}

export interface GameRuntime {
  readonly identity: { readonly generatorVersion: GeneratorVersionId; readonly worldSeed: string };
  readonly topology: WorldTopology;
  readonly content: typeof CONTENT_REGISTRY;
  save: SaveState;
  currentPlaneBase: PlaneBase;
  omittedFixtureIds: readonly string[];
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
  spd: number,
): ActorState | null {
  if (!point) {
    return null;
  }
  return {
    id,
    definitionId,
    kind,
    plane,
    x: point.x,
    y: point.y,
    hp: 1,
    maxHp: 1,
    spd,
    initiativeModifier: 0,
    blocking: true,
  };
}

export function materializeActors(topology: WorldTopology, planeBase: PlaneBase, player: ActorState): ActorState[] {
  const actors: ActorState[] = [player];
  const occupied = new Set([`${player.y},${player.x}`]);
  const points = new Map(planeBase.namedPoints.map((point) => [point.id, point]));
  for (const npc of topology.npcInstances) {
    if (!planesEqual(npc.plane, planeBase.plane)) {
      continue;
    }
    const actor = actorAtPoint(npc.id, npc.npcId, "npc", npc.plane, points.get(npc.id), GLOBAL_CONSTANTS.playerStartingAttribute);
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
    const actor = actorAtPoint(guardian.id, guardian.monsterId, "guardian", guardian.plane, points.get(guardian.id), GLOBAL_CONSTANTS.playerStartingAttribute);
    if (!actor || occupied.has(`${actor.y},${actor.x}`)) {
      continue;
    }
    occupied.add(`${actor.y},${actor.x}`);
    actors.push(actor);
  }
  return actors;
}

export function createRuntimeFromAccepted(
  world: AcceptedWorldSuccess,
  planeBase: PlaneBase,
  omittedFixtureIds: readonly string[] = [],
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
      learnedAbilities: [...STARTING_PLAYER_STATE.learnedAbilities],
      safeAnchor: { plane: planeBase.plane, x: (anchor ?? spawn).x, y: (anchor ?? spawn).y },
    },
    actors: materializeActors(world.topology, planeBase, playerActor),
    flags: [],
  };
  return {
    identity: { generatorVersion: world.topology.generatorVersion, worldSeed: world.topology.worldSeed },
    topology: world.topology,
    content: CONTENT_REGISTRY,
    save,
    currentPlaneBase: planeBase,
    omittedFixtureIds,
  };
}

export function createNewGame(version: string, seed: string, options: CreateNewGameOptions = {}): GameRuntime {
  const world = getAcceptedWorld(version, seed, options);
  if (!world.ok) {
    throw new Error(`cannot create New Game: ${world.code}: ${world.message}`);
  }
  const materialized = materializeRuntimePlane(world, STARTING_PLANE, options.materializePlane ?? options.generatePlane);
  if (!materialized.ok) {
    throw new Error(`starting plane unrealizable: ${materialized.message}`);
  }
  return createRuntimeFromAccepted(world, materialized.plane, materialized.omittedFixtureIds);
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
