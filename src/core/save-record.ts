import { CORE_IDENTITY } from "./identity";
import type { GeneratorVersionId } from "./model/ids";
import type { SaveState } from "./model/save-state";

export const SAVE_FORMAT_VERSION = 1 as const;
export type SaveFormatVersion = typeof SAVE_FORMAT_VERSION;

export interface SaveRecord {
  readonly saveFormatVersion: number;
  readonly generatorVersion: GeneratorVersionId;
  readonly worldSeed: string;
  readonly topologyHash: string;
  readonly saveState: SaveState;
  readonly updatedAt: string;
}

export type SaveValidationFailure = {
  readonly ok: false;
  readonly code: "SAVE_FORMAT" | "GENERATOR_VERSION" | "INVALID_SAVE";
  readonly message: string;
};

export type SaveValidationSuccess = { readonly ok: true; readonly record: SaveRecord };

export type SaveValidationResult = SaveValidationSuccess | SaveValidationFailure;

export function cloneSaveState(save: SaveState): SaveState {
  return JSON.parse(JSON.stringify(save)) as SaveState;
}

export function makeSaveRecord(save: SaveState, updatedAt = "1970-01-01T00:00:00.000Z"): SaveRecord {
  return {
    saveFormatVersion: SAVE_FORMAT_VERSION,
    generatorVersion: save.generatorVersion,
    worldSeed: save.worldSeed,
    topologyHash: save.topologyHash,
    saveState: cloneSaveState(save),
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSaveRecord(value: unknown): SaveValidationResult {
  if (!isRecord(value)) {
    return { ok: false, code: "INVALID_SAVE", message: "save is not an object" };
  }
  if (value.saveFormatVersion !== SAVE_FORMAT_VERSION) {
    return { ok: false, code: "SAVE_FORMAT", message: `unsupported saveFormatVersion ${String(value.saveFormatVersion)}` };
  }
  if (value.generatorVersion !== CORE_IDENTITY.generatorVersion) {
    return { ok: false, code: "GENERATOR_VERSION", message: `incompatible generatorVersion ${String(value.generatorVersion)}` };
  }
  if (typeof value.worldSeed !== "string" || value.worldSeed.length === 0) {
    return { ok: false, code: "INVALID_SAVE", message: "worldSeed missing" };
  }
  if (typeof value.topologyHash !== "string" || value.topologyHash.length === 0) {
    return { ok: false, code: "INVALID_SAVE", message: "topologyHash missing" };
  }
  if (!isRecord(value.saveState)) {
    return { ok: false, code: "INVALID_SAVE", message: "saveState missing" };
  }
  const save = value.saveState as unknown as SaveState;
  if (save.generatorVersion !== value.generatorVersion || save.worldSeed !== value.worldSeed || save.topologyHash !== value.topologyHash) {
    return { ok: false, code: "INVALID_SAVE", message: "save identity fields do not match the record wrapper" };
  }
  if (!Array.isArray(save.actors) || !save.player || !Array.isArray(save.player.inventory)) {
    return { ok: false, code: "INVALID_SAVE", message: "saveState is missing required collections" };
  }
  if (!Array.isArray(save.player.keyItems)) {
    save.player.keyItems = [];
  }
  if (!Array.isArray(save.groundItems)) {
    save.groundItems = [];
  }
  if (!Array.isArray(save.collectedSources)) {
    save.collectedSources = [];
  }
  if (!Array.isArray(save.quests)) {
    save.quests = [];
  }
  if (!Array.isArray(save.awardedApEvents)) {
    save.awardedApEvents = [];
  }
  return {
    ok: true,
    record: {
      saveFormatVersion: SAVE_FORMAT_VERSION,
      generatorVersion: save.generatorVersion,
      worldSeed: save.worldSeed,
      topologyHash: save.topologyHash,
      saveState: cloneSaveState(save),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "1970-01-01T00:00:00.000Z",
    },
  };
}

export function parseSaveJson(text: string): SaveValidationResult {
  try {
    return validateSaveRecord(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, code: "INVALID_SAVE", message: "save JSON could not be parsed" };
  }
}
