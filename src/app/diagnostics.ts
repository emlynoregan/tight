import { CORE_IDENTITY } from "../core/identity";
import { planeKey } from "../core/model/plane";
import type { SaveRecord } from "../core/save-record";
import type { GameRuntime } from "../core";
import { APP_VERSION } from "./build-info";

export interface GameDiagnostics {
  readonly appVersion: string;
  readonly generatorVersion: string;
  readonly worldSeed: string;
  readonly topologyHash: string;
  readonly plane: string;
  readonly tick: number;
  readonly errorCode: string;
  readonly errorMessage: string;
}

export function diagnosticsFromRuntime(
  runtime: GameRuntime | null,
  errorCode: string,
  errorMessage: string,
): GameDiagnostics {
  return {
    appVersion: APP_VERSION,
    generatorVersion: runtime?.save.generatorVersion ?? CORE_IDENTITY.generatorVersion,
    worldSeed: runtime?.save.worldSeed ?? "",
    topologyHash: runtime?.save.topologyHash ?? "",
    plane: runtime ? planeKey(runtime.save.plane) : "",
    tick: runtime?.save.tick ?? 0,
    errorCode,
    errorMessage,
  };
}

export function diagnosticsFromSaveRecord(
  record: SaveRecord | null,
  errorCode: string,
  errorMessage: string,
): GameDiagnostics {
  return {
    appVersion: APP_VERSION,
    generatorVersion: record?.generatorVersion ?? CORE_IDENTITY.generatorVersion,
    worldSeed: record?.worldSeed ?? "",
    topologyHash: record?.topologyHash ?? "",
    plane: record ? planeKey(record.saveState.plane) : "",
    tick: record?.saveState.tick ?? 0,
    errorCode,
    errorMessage,
  };
}
