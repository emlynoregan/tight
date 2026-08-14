import { assertContentRegistryValid } from "../data/validate";
import { GLOBAL_CONSTANTS } from "../model/constants";
import type { GeneratorVersionId } from "../model/ids";
import { comparePlanes, OLYMPUS_PLANE, planeKey, STARTING_PLANE, type PlanePair } from "../model/plane";
import { generatePlaneBase } from "./generate-plane";
import type { PlaneGenerationResult } from "./plane-types";
import { resolveProgressionOutcomes } from "./resolve-progression";
import type { SolverResult, WitnessStep } from "./solver-types";
import { generateTopology } from "./topology-generator";
import type { ProgressionSource, QuestInstance, ShopInstance, WorldTopology } from "./topology-types";
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

export interface ProofRequiredFixtures {
  readonly transitionIds: ReadonlySet<string>;
  readonly sourceIds: ReadonlySet<string>;
  readonly shopIds: ReadonlySet<string>;
  readonly guardianIds: ReadonlySet<string>;
  readonly questIds: ReadonlySet<string>;
  readonly npcIds: ReadonlySet<string>;
}

function shopIdForStockSource(source: ProgressionSource, shops: readonly ShopInstance[]): string | null {
  if (source.sourceType !== "shop_stock") {
    return null;
  }
  const matches = shops.filter((shop) => source.id.startsWith(`source.shop_stock.${shop.id}.`));
  if (matches.length === 0) {
    return null;
  }
  return [...matches].sort((left, right) => right.id.length - left.id.length)[0]!.id;
}

function addQuestNpc(npcIds: Set<string>, quest: QuestInstance | undefined): void {
  if (quest?.npcId) {
    npcIds.add(quest.npcId);
  }
}

export function proofRequiredFixtures(topology: WorldTopology, witness: readonly WitnessStep[]): ProofRequiredFixtures {
  const transitionIds = new Set<string>();
  const sourceIds = new Set<string>();
  const shopIds = new Set<string>();
  const guardianIds = new Set<string>();
  const questIds = new Set<string>();
  const npcIds = new Set<string>();
  const gatesById = new Map(topology.gates.map((gate) => [gate.id, gate]));
  const questsById = new Map(topology.questInstances.map((quest) => [quest.id, quest]));
  for (const step of witness) {
    if (step.type === "TRAVERSE_TRANSITION" && step.id) {
      transitionIds.add(step.id);
    }
    if (step.type === "UNLOCK_GATE" && step.id) {
      const gate = gatesById.get(step.id);
      if (gate) {
        transitionIds.add(gate.transitionId);
      }
    }
    if ((step.type === "COLLECT_SOURCE" || step.type === "BUY_ITEM") && step.id) {
      sourceIds.add(step.id);
    }
    if (step.type === "DEFEAT_GUARDIAN" && step.id) {
      guardianIds.add(step.id);
    }
    if (step.type === "COMPLETE_QUEST" && step.id) {
      questIds.add(step.id);
      addQuestNpc(npcIds, questsById.get(step.id));
    }
  }
  for (const source of topology.progressionSources) {
    if (!sourceIds.has(source.id)) {
      continue;
    }
    const shopId = shopIdForStockSource(source, topology.shopInstances);
    if (shopId) {
      shopIds.add(shopId);
    }
  }
  for (const shop of topology.shopInstances) {
    if (shopIds.has(shop.id) && shop.npcInstanceId) {
      npcIds.add(shop.npcInstanceId);
    }
  }
  return { transitionIds, sourceIds, shopIds, guardianIds, questIds, npcIds };
}

export function witnessPreflightTopology(topology: WorldTopology, witness: readonly WitnessStep[]): WorldTopology {
  const proof = proofRequiredFixtures(topology, witness);
  return {
    ...topology,
    transitions: topology.transitions.filter((row) => proof.transitionIds.has(row.id)),
    progressionSources: topology.progressionSources.filter((row) => proof.sourceIds.has(row.id)),
    shopInstances: topology.shopInstances.filter((row) => proof.shopIds.has(row.id)),
    guardianInstances: topology.guardianInstances.filter((row) => proof.guardianIds.has(row.id)),
    questInstances: topology.questInstances.filter((row) => proof.questIds.has(row.id)),
    npcInstances: topology.npcInstances.filter((row) => proof.npcIds.has(row.id)),
  };
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
  const scoped = witnessPreflightTopology(topology, witness);
  const planes: PreflightedPlane[] = [];
  for (const plane of witnessPlanes(witness)) {
    const generated = generatePlane(seed, scoped, plane);
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
