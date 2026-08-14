import { CONTENT_REGISTRY } from "../data/registry";
import { getAcceptedWorld } from "../generation/accepted-world";
import { planeKey } from "../model/plane";
import type { SaveState } from "../model/save-state";
import { cloneSaveState, type SaveRecord } from "../save-record";
import type { CreateNewGameOptions, GameRuntime } from "./game-runtime";
import { materializeRuntimePlane } from "./materialize-plane";

export type LoadGameFailure = {
  readonly ok: false;
  readonly code: "GENERATOR_VERSION" | "TOPOLOGY_MISMATCH" | "UNREALIZABLE_PLANE" | "INVALID_SAVE";
  readonly message: string;
};

export type LoadGameSuccess = { readonly ok: true; readonly runtime: GameRuntime };

export type LoadGameResult = LoadGameSuccess | LoadGameFailure;

export function createRuntimeFromSave(save: SaveState, options: CreateNewGameOptions = {}): LoadGameResult {
  const world = getAcceptedWorld(save.generatorVersion, save.worldSeed, options);
  if (!world.ok) {
    return { ok: false, code: "INVALID_SAVE", message: `${world.code}: ${world.message}` };
  }
  if (world.topologyHash !== save.topologyHash) {
    return {
      ok: false,
      code: "TOPOLOGY_MISMATCH",
      message: `stored topologyHash ${save.topologyHash} does not match regenerated ${world.topologyHash}`,
    };
  }
  const generate = options.materializePlane ?? options.generatePlane;
  const materialized = materializeRuntimePlane(world, save.plane, generate);
  if (!materialized.ok) {
    return { ok: false, code: "UNREALIZABLE_PLANE", message: materialized.message };
  }
  const restored = cloneSaveState(save);
  if (!Array.isArray(restored.player.keyItems)) {
    restored.player.keyItems = [];
  }
  if (!Array.isArray(restored.groundItems)) {
    restored.groundItems = [];
  }
  return {
    ok: true,
    runtime: {
      identity: { generatorVersion: world.topology.generatorVersion, worldSeed: world.topology.worldSeed },
      world,
      topology: world.topology,
      content: CONTENT_REGISTRY,
      save: restored,
      currentPlaneBase: materialized.plane,
      omittedFixtureIds: materialized.omittedFixtureIds,
      scriptedActions: new Map(),
      planeCache: new Map([[planeKey(materialized.plane.plane), materialized.plane]]),
      pendingPlayerTransition: null,
      ...(generate ? { generatePlane: generate } : {}),
    },
  };
}

export function createRuntimeFromSaveRecord(record: SaveRecord, options: CreateNewGameOptions = {}): LoadGameResult {
  if (record.topologyHash !== record.saveState.topologyHash) {
    return { ok: false, code: "INVALID_SAVE", message: "record topologyHash does not match saveState" };
  }
  return createRuntimeFromSave(record.saveState, options);
}
