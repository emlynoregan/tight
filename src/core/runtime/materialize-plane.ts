import { planesEqual, type PlanePair } from "../model/plane";
import type { PlaneGenerateFn, AcceptedWorldSuccess } from "../generation/accepted-world";
import { proofRequiredFixtures, witnessPreflightTopology } from "../generation/accepted-world";
import { generatePlaneBase } from "../generation/generate-plane";
import type { PlaneBase, PlaneGenerationResult } from "../generation/plane-types";
import { compareStableIds } from "../generation/semantic-random";
import type { WorldTopology } from "../generation/topology-types";

export interface RuntimePlaneSuccess {
  readonly ok: true;
  readonly plane: PlaneBase;
  readonly omittedFixtureIds: readonly string[];
}

export interface RuntimePlaneFailure {
  readonly ok: false;
  readonly code: "PROOF_REQUIRED_REALIZATION_FAILURE";
  readonly message: string;
}

export type RuntimePlaneResult = RuntimePlaneSuccess | RuntimePlaneFailure;

function fixtureIdsOnPlane(topology: WorldTopology, plane: PlanePair): string[] {
  const ids: string[] = [];
  for (const row of topology.transitions) {
    if (planesEqual(row.sourcePlane, plane) || planesEqual(row.destinationPlane, plane)) {
      ids.push(row.id);
    }
  }
  for (const row of topology.progressionSources) {
    if (planesEqual(row.plane, plane)) {
      ids.push(row.id);
    }
  }
  for (const row of topology.shopInstances) {
    if (planesEqual(row.plane, plane)) {
      ids.push(row.id);
    }
  }
  for (const row of topology.guardianInstances) {
    if (planesEqual(row.plane, plane)) {
      ids.push(row.id);
    }
  }
  for (const row of topology.npcInstances) {
    if (planesEqual(row.plane, plane)) {
      ids.push(row.id);
    }
  }
  for (const row of topology.questInstances) {
    if (planesEqual(row.plane, plane)) {
      ids.push(row.id);
    }
  }
  return [...new Set(ids)].sort(compareStableIds);
}

function omittedNonWitnessIds(topology: WorldTopology, witness: AcceptedWorldSuccess["witness"], plane: PlanePair): string[] {
  const proof = proofRequiredFixtures(topology, witness);
  const required = new Set<string>([
    ...proof.transitionIds,
    ...proof.sourceIds,
    ...proof.shopIds,
    ...proof.guardianIds,
    ...proof.npcIds,
    ...proof.questIds,
  ]);
  return fixtureIdsOnPlane(topology, plane).filter((id) => !required.has(id));
}

export function materializeRuntimePlane(
  world: AcceptedWorldSuccess,
  plane: PlanePair,
  generatePlane?: PlaneGenerateFn,
): RuntimePlaneResult {
  const generate: PlaneGenerateFn =
    generatePlane ?? ((seed, topology, target) => generatePlaneBase(seed, topology, target, world.topology.generatorVersion));
  const full: PlaneGenerationResult = generate(world.topology.worldSeed, world.topology, plane);
  if (full.ok) {
    return { ok: true, plane: full.plane, omittedFixtureIds: [] };
  }
  const proofTopology = witnessPreflightTopology(world.topology, world.witness);
  const proof: PlaneGenerationResult = generate(world.topology.worldSeed, proofTopology, plane);
  if (!proof.ok) {
    return {
      ok: false,
      code: "PROOF_REQUIRED_REALIZATION_FAILURE",
      message: proof.message,
    };
  }
  return {
    ok: true,
    plane: proof.plane,
    omittedFixtureIds: omittedNonWitnessIds(world.topology, world.witness, plane),
  };
}
