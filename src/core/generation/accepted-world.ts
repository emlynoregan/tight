import { assertContentRegistryValid } from "../data/validate";
import { GLOBAL_CONSTANTS } from "../model/constants";
import type { GeneratorVersionId } from "../model/ids";
import { comparePlanes, OLYMPUS_PLANE, planeKey, STARTING_PLANE, type PlanePair } from "../model/plane";
import { generatePlaneBase } from "./generate-plane";
import type { PlaneGenerationResult } from "./plane-types";
import { resolveProgressionOutcomes } from "./resolve-progression";
import type { SolverResult, WitnessStep } from "./solver-types";
import { generateTopology } from "./topology-generator";
import type { WorldTopology } from "./topology-types";
import { proveWinnable } from "./winnability-solver";

export type PlaneGenerateFn = (
  worldSeed: string,
  topology: WorldTopology,
  plane: PlanePair,
) => PlaneGenerationResult;

export interface RejectedAttempt {
  readonly attempt: number;
  readonly code: string;
  readonly message: string;
}

export interface PreflightedPlane {
  readonly plane: PlanePair;
  readonly planeHash: string;
  readonly repairCount: number;
}

export interface WitnessPreflightSuccess {
  readonly ok: true;
  readonly planes: readonly PreflightedPlane[];
}

export interface WitnessPreflightFailure {
  readonly ok: false;
  readonly code: "TOPOLOGY_REALIZATION_FAILURE";
  readonly message: string;
  readonly plane: PlanePair;
}

export type WitnessPreflightResult = WitnessPreflightSuccess | WitnessPreflightFailure;

export interface AcceptedWorldSuccess {
  readonly ok: true;
  readonly topology: WorldTopology;
  readonly witness: readonly WitnessStep[];
  readonly topologyHash: string;
  readonly acceptedAttempt: number;
  readonly preflight: WitnessPreflightSuccess;
  readonly rejectedAttempts: readonly RejectedAttempt[];
}

export interface AcceptedWorldFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly rejectedAttempts: readonly RejectedAttempt[];
}

export type AcceptedWorldResult = AcceptedWorldSuccess | AcceptedWorldFailure;

export interface AcceptedWorldOptions {
  readonly maxAttempts?: number;
  readonly cache?: Map<string, AcceptedWorldSuccess>;
  readonly generatePlane?: PlaneGenerateFn;
}

export interface AcceptedWorldSummary {
  readonly seed: string;
  readonly acceptedAttempt: number;
  readonly topologyHash: string;
  readonly witnessLength: number;
  readonly witnessTypes: readonly string[];
  readonly preflightPlaneCount: number;
  readonly startPlaneHash: string;
  readonly olympusPlaneHash: string;
  readonly rejectedAttemptCount: number;
}

function cacheKey(version: string, seed: string): string {
  return `${version}\0${seed}`;
}

function mapStructuralCode(code: string): string {
  if (code === "STRUCTURAL_VALIDATION_FAILED") {
    return "TOPOLOGY_STRUCTURAL_FAILURE";
  }
  return code;
}

export function witnessPlanes(witness: readonly WitnessStep[]): PlanePair[] {
  const seen = new Set<string>();
  const planes: PlanePair[] = [];
  const add = (plane: PlanePair): void => {
    const key = planeKey(plane);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    planes.push(plane);
  };
  add(STARTING_PLANE);
  for (const step of witness) {
    if (step.plane) {
      add(step.plane);
    }
  }
  add(OLYMPUS_PLANE);
  return [...planes].sort(comparePlanes);
}

export function preflightWitnessPlanes(
  version: string,
  seed: string,
  topology: WorldTopology,
  witness: readonly WitnessStep[],
  generatePlane: PlaneGenerateFn = (worldSeed, world, plane) => generatePlaneBase(worldSeed, world, plane),
): WitnessPreflightResult {
  void version;
  const planes: PreflightedPlane[] = [];
  for (const plane of witnessPlanes(witness)) {
    const generated = generatePlane(seed, topology, plane);
    if (!generated.ok) {
      return {
        ok: false,
        code: "TOPOLOGY_REALIZATION_FAILURE",
        message: generated.message,
        plane,
      };
    }
    planes.push({
      plane,
      planeHash: generated.plane.planeHash,
      repairCount: generated.plane.repairs.length,
    });
  }
  return { ok: true, planes };
}

export function summarizeAcceptedWorld(world: AcceptedWorldSuccess): AcceptedWorldSummary {
  const start = world.preflight.planes.find((row) => planeKey(row.plane) === planeKey(STARTING_PLANE));
  const olympus = world.preflight.planes.find((row) => planeKey(row.plane) === planeKey(OLYMPUS_PLANE));
  const types = [...new Set(world.witness.map((step) => step.type))].sort();
  return {
    seed: world.topology.worldSeed,
    acceptedAttempt: world.acceptedAttempt,
    topologyHash: world.topologyHash,
    witnessLength: world.witness.length,
    witnessTypes: types,
    preflightPlaneCount: world.preflight.planes.length,
    startPlaneHash: start?.planeHash ?? "",
    olympusPlaneHash: olympus?.planeHash ?? "",
    rejectedAttemptCount: world.rejectedAttempts.length,
  };
}

export function getAcceptedWorld(
  version: string,
  seed: string,
  options: AcceptedWorldOptions = {},
): AcceptedWorldResult {
  if (version !== GLOBAL_CONSTANTS.generatorVersion) {
    return {
      ok: false,
      code: "GENERATOR_VERSION_MISMATCH",
      message: `unsupported generator version ${version}`,
      rejectedAttempts: [],
    };
  }
  const key = cacheKey(version, seed);
  const cached = options.cache?.get(key);
  if (cached) {
    return cached;
  }
  try {
    assertContentRegistryValid();
  } catch (error) {
    return {
      ok: false,
      code: "STATIC_CONTENT_INVALID",
      message: error instanceof Error ? error.message : String(error),
      rejectedAttempts: [],
    };
  }

  const generatorVersion: GeneratorVersionId = GLOBAL_CONSTANTS.generatorVersion;
  const maxAttempts = Math.min(options.maxAttempts ?? GLOBAL_CONSTANTS.maxTopologyAttempts, GLOBAL_CONSTANTS.maxTopologyAttempts);
  const generatePlane: PlaneGenerateFn = options.generatePlane ?? ((worldSeed, world, plane) => generatePlaneBase(worldSeed, world, plane, generatorVersion));
  const rejectedAttempts: RejectedAttempt[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const generated = generateTopology(seed, attempt, generatorVersion);
    if (!generated.ok) {
      rejectedAttempts.push({
        attempt,
        code: mapStructuralCode(generated.code),
        message: generated.message,
      });
      continue;
    }
    const topology = resolveProgressionOutcomes(generated.topology);
    const proof: SolverResult = proveWinnable(topology);
    if (!proof.ok) {
      rejectedAttempts.push({
        attempt,
        code: "TOPOLOGY_UNWINNABLE",
        message: `reachable ${proof.failure.reachablePlaneCount} planes`,
      });
      continue;
    }
    const preflight = preflightWitnessPlanes(version, seed, topology, proof.witness, generatePlane);
    if (!preflight.ok) {
      rejectedAttempts.push({
        attempt,
        code: preflight.code,
        message: `${planeKey(preflight.plane)}: ${preflight.message}`,
      });
      continue;
    }
    const success: AcceptedWorldSuccess = {
      ok: true,
      topology,
      witness: proof.witness,
      topologyHash: topology.topologyHash,
      acceptedAttempt: attempt,
      preflight,
      rejectedAttempts,
    };
    options.cache?.set(key, success);
    return success;
  }

  return {
    ok: false,
    code: "TOPOLOGY_ATTEMPT_LIMIT_EXCEEDED",
    message: `no accepted world for seed ${seed} within ${maxAttempts} attempts`,
    rejectedAttempts,
  };
}

export function createAcceptedWorldCache(): Map<string, AcceptedWorldSuccess> {
  return new Map();
}
