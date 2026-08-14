import { describe, expect, it } from "vitest";
import {
  createAcceptedWorldCache,
  generatePlaneBase,
  generateTopology,
  getAcceptedWorld,
  OLYMPUS_PLANE,
  planeKey,
  proofRequiredFixtures,
  proveWinnable,
  resolveProgressionOutcomes,
  STARTING_PLANE,
  summarizeAcceptedWorld,
  sweepAcceptedWorlds,
  deterministicSweepSeeds,
  witnessPlanes,
  witnessPreflightTopology,
} from "../../src/core";
import type { PlaneGenerationResult } from "../../src/core";

function requireWorld(version: string, seed: string) {
  const result = getAcceptedWorld(version, seed);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

function failPlane(plane = STARTING_PLANE): PlaneGenerationResult {
  return {
    ok: false,
    code: "PLANE_GEOMETRY_FAILURE",
    message: "forced unrealizable",
    issues: [{ validator: "required_points_connected", detail: "forced" }],
    plane,
  };
}

function attemptZeroProof(seed: string) {
  const generated = generateTopology(seed, 0);
  expect(generated.ok).toBe(true);
  if (!generated.ok) {
    throw new Error(generated.message);
  }
  const topology = resolveProgressionOutcomes(generated.topology);
  const proof = proveWinnable(topology);
  expect(proof.ok).toBe(true);
  if (!proof.ok) {
    throw new Error("expected solver pass");
  }
  return { topology, witness: proof.witness };
}

function nonWitnessFixtures(topology: ReturnType<typeof attemptZeroProof>["topology"], witness: ReturnType<typeof attemptZeroProof>["witness"]) {
  const proof = proofRequiredFixtures(topology, witness);
  const planes = new Set(witnessPlanes(witness).map(planeKey));
  const extraSource = topology.progressionSources.find((source) => !proof.sourceIds.has(source.id) && planes.has(planeKey(source.plane)));
  const extraShop = topology.shopInstances.find((shop) => !proof.shopIds.has(shop.id) && planes.has(planeKey(shop.plane)));
  const extraTransition = topology.transitions.find(
    (row) =>
      !proof.transitionIds.has(row.id) &&
      (planes.has(planeKey(row.sourcePlane)) || planes.has(planeKey(row.destinationPlane))),
  );
  const witnessSource = topology.progressionSources.find((source) => proof.sourceIds.has(source.id));
  const witnessTransition = topology.transitions.find((row) => proof.transitionIds.has(row.id));
  return { proof, extraSource, extraShop, extraTransition, witnessSource, witnessTransition };
}

describe("accepted world pipeline", () => {
  it("selects the same accepted attempt and topology hash for the same identity", () => {
    const first = requireWorld("tight-v1", "0");
    const second = requireWorld("tight-v1", "0");
    expect(first.acceptedAttempt).toBe(second.acceptedAttempt);
    expect(first.topologyHash).toBe(second.topologyHash);
    expect(first.witness).toEqual(second.witness);
    expect(first.preflight.planes.map((row) => row.planeHash)).toEqual(second.preflight.planes.map((row) => row.planeHash));
    expect(first.topology).toEqual(second.topology);
  });

  it("returns cached accepted worlds without regenerating", () => {
    const cache = createAcceptedWorldCache();
    const first = getAcceptedWorld("tight-v1", "1", { cache });
    const second = getAcceptedWorld("tight-v1", "1", { cache });
    expect(first.ok).toBe(true);
    expect(second).toBe(first);
  });

  it("rejects a solver-passing but unrealizable witness and retries a fresh attempt", () => {
    const seed = "retry-unrealizable";
    const attemptZero = generateTopology(seed, 0);
    expect(attemptZero.ok).toBe(true);
    const result = getAcceptedWorld("tight-v1", seed, {
      generatePlane: (worldSeed, topology, plane) => {
        if (topology.topologyAttempt === 0) {
          return failPlane(plane);
        }
        return generatePlaneBase(worldSeed, topology, plane);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.acceptedAttempt).toBeGreaterThan(0);
    expect(result.rejectedAttempts[0]?.code).toBe("TOPOLOGY_REALIZATION_FAILURE");
    if (attemptZero.ok) {
      expect(result.topologyHash).not.toBe(attemptZero.topology.topologyHash);
      expect(result.topology.topologyAttempt).not.toBe(0);
    }
  });

  it("does not mutate a failed topology into success", () => {
    const seed = "no-mutate";
    const first = generateTopology(seed, 0);
    const second = generateTopology(seed, 0);
    expect(first).toEqual(second);
    const accepted = getAcceptedWorld("tight-v1", seed, {
      generatePlane: (worldSeed, topology, plane) => {
        if (topology.topologyAttempt === 0) {
          return failPlane(plane);
        }
        return generatePlaneBase(worldSeed, topology, plane);
      },
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      throw new Error(accepted.message);
    }
    const regeneratedZero = generateTopology(seed, 0);
    expect(regeneratedZero).toEqual(first);
    expect(accepted.topology.topologyAttempt).not.toBe(0);
  });

  it("fails loudly when the attempt cap is exhausted", () => {
    const result = getAcceptedWorld("tight-v1", "cap-exhaust", {
      maxAttempts: 2,
      generatePlane: (_seed, _topology, plane) => failPlane(plane),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected cap failure");
    }
    expect(result.code).toBe("TOPOLOGY_ATTEMPT_LIMIT_EXCEEDED");
    expect(result.rejectedAttempts).toHaveLength(2);
    expect(result.rejectedAttempts.every((row) => row.code === "TOPOLOGY_REALIZATION_FAILURE")).toBe(true);
  });

  it("rejects an unsupported generator version", () => {
    const result = getAcceptedWorld("tight-v0", "0");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected version failure");
    }
    expect(result.code).toBe("GENERATOR_VERSION_MISMATCH");
  });

  it("preflights witness planes including start and olympus", () => {
    const world = requireWorld("tight-v1", "0");
    const planes = witnessPlanes(world.witness);
    expect(planes[0]).toEqual(STARTING_PLANE);
    expect(planes.some((plane) => plane.a === OLYMPUS_PLANE.a && plane.b === OLYMPUS_PLANE.b)).toBe(true);
    expect(world.preflight.planes).toHaveLength(planes.length);
    expect(world.witness.some((step) => step.type === "REACH_OLYMPUS" || step.type === "FINAL_BOSS_AVAILABLE")).toBe(true);
  });

  it("rejects when a proof-required witness fixture is unrealizable", () => {
    const seed = "0";
    const { topology, witness } = attemptZeroProof(seed);
    const { witnessSource, witnessTransition } = nonWitnessFixtures(topology, witness);
    const requiredId = witnessSource?.id ?? witnessTransition?.id;
    expect(requiredId).toBeDefined();
    const result = getAcceptedWorld("tight-v1", seed, {
      generatePlane: (worldSeed, scoped, plane) => {
        const present =
          scoped.progressionSources.some((source) => source.id === requiredId) ||
          scoped.transitions.some((row) => row.id === requiredId);
        if (scoped.topologyAttempt === 0 && present) {
          return failPlane(plane);
        }
        return generatePlaneBase(worldSeed, scoped, plane);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.acceptedAttempt).toBeGreaterThan(0);
    expect(result.rejectedAttempts[0]?.code).toBe("TOPOLOGY_REALIZATION_FAILURE");
  });

  it("does not reject a realizable witness when a non-witness fixture on the same plane is unrealizable", () => {
    const seed = "0";
    const { topology, witness } = attemptZeroProof(seed);
    const { extraSource, extraShop, extraTransition } = nonWitnessFixtures(topology, witness);
    expect(extraSource ?? extraShop ?? extraTransition).toBeDefined();
    const baseline = requireWorld("tight-v1", seed);
    const result = getAcceptedWorld("tight-v1", seed, {
      generatePlane: (worldSeed, scoped, plane) => {
        if (extraSource && scoped.progressionSources.some((source) => source.id === extraSource.id)) {
          return failPlane(plane);
        }
        if (extraShop && scoped.shopInstances.some((shop) => shop.id === extraShop.id)) {
          return failPlane(plane);
        }
        if (extraTransition && scoped.transitions.some((row) => row.id === extraTransition.id)) {
          return failPlane(plane);
        }
        return generatePlaneBase(worldSeed, scoped, plane);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.acceptedAttempt).toBe(baseline.acceptedAttempt);
    expect(result.topologyHash).toBe(baseline.topologyHash);
  });

  it("does not let non-witness shop or source identity change the accepted world", () => {
    const seed = "0";
    const { topology, witness } = attemptZeroProof(seed);
    const { extraSource, extraShop } = nonWitnessFixtures(topology, witness);
    expect(extraSource ?? extraShop).toBeDefined();
    const failIfPresent = (id: string, kind: "source" | "shop") =>
      getAcceptedWorld("tight-v1", seed, {
        generatePlane: (worldSeed, scoped, plane) => {
          const present =
            kind === "source"
              ? scoped.progressionSources.some((source) => source.id === id)
              : scoped.shopInstances.some((shop) => shop.id === id);
          if (present) {
            return failPlane(plane);
          }
          return generatePlaneBase(worldSeed, scoped, plane);
        },
      });
    const first = extraSource ? failIfPresent(extraSource.id, "source") : failIfPresent(extraShop!.id, "shop");
    const second = extraShop ? failIfPresent(extraShop.id, "shop") : failIfPresent(extraSource!.id, "source");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      throw new Error("expected both identities to accept");
    }
    expect(first.acceptedAttempt).toBe(second.acceptedAttempt);
    expect(first.topologyHash).toBe(second.topologyHash);
  });

  it("keeps non-witness fixtures on the accepted topology for later full plane realization", () => {
    const seed = "0";
    const world = requireWorld("tight-v1", seed);
    const { extraSource, extraShop, extraTransition } = nonWitnessFixtures(world.topology, world.witness);
    const extra = extraSource ?? extraShop ?? extraTransition;
    expect(extra).toBeDefined();
    const plane = "plane" in extra! ? extra.plane : extra!.sourcePlane;
    const scoped = generatePlaneBase(seed, witnessPreflightTopology(world.topology, world.witness), plane);
    const full = generatePlaneBase(seed, world.topology, plane);
    expect(scoped.ok).toBe(true);
    expect(full.ok).toBe(true);
    if (!scoped.ok || !full.ok) {
      throw new Error("expected both generations to succeed");
    }
    const extraId = extra!.id;
    expect(scoped.plane.namedPoints.some((point) => point.id === extraId || point.id.startsWith(`${extraId}.`))).toBe(false);
    expect(
      full.plane.namedPoints.some((point) => point.id === extraId || point.id.startsWith(`${extraId}.`) || point.id === `transition.${extraId}`),
    ).toBe(true);
  });

  it("records a deterministic regression corpus", () => {
    const corpus = [
      summarizeAcceptedWorld(requireWorld("tight-v1", "0")),
      summarizeAcceptedWorld(requireWorld("tight-v1", "1")),
      summarizeAcceptedWorld(requireWorld("tight-v1", "seed-alpha")),
    ];
    expect(corpus).toEqual([
      {
        seed: "0",
        acceptedAttempt: 0,
        topologyHash: "ca58a14df09cfe39d90fa1f4e47344a80a3671b3fda85408e9ebb9972b21b708",
        witnessLength: 392,
        witnessTypes: [
          "ACQUIRE_KEY",
          "COLLECT_SOURCE",
          "COMPLETE_QUEST",
          "DEFEAT_GUARDIAN",
          "DISCOVER_DIMENSION",
          "FINAL_BOSS_AVAILABLE",
          "LEARN_ABILITY",
          "REACH_OLYMPUS",
          "START",
          "TRAVERSE_TRANSITION",
          "UNLOCK_GATE",
        ],
        preflightPlaneCount: 116,
        startPlaneHash: "cb7dfca91190b0bbad6477ca908c58008b85e79f67bf0405e03c3906b4b2476d",
        olympusPlaneHash: "2dd7ee3450157270a23653bac720bb8935b85f00e7fc9a781994fbdb7cc1cdbd",
        rejectedAttemptCount: 0,
      },
      {
        seed: "1",
        acceptedAttempt: 0,
        topologyHash: "459de820a3c65be611f372c95d61905250cd06b1ba17a1f598144e9a4495d7c5",
        witnessLength: 371,
        witnessTypes: [
          "ACQUIRE_KEY",
          "COLLECT_SOURCE",
          "COMPLETE_QUEST",
          "DEFEAT_GUARDIAN",
          "DISCOVER_DIMENSION",
          "FINAL_BOSS_AVAILABLE",
          "LEARN_ABILITY",
          "REACH_OLYMPUS",
          "START",
          "TRAVERSE_TRANSITION",
          "UNLOCK_GATE",
        ],
        preflightPlaneCount: 115,
        startPlaneHash: "de63625eca695566b2df2d705c895d85428c56835c6a60113bec34162e878db4",
        olympusPlaneHash: "c8ddaa9263142dc178a9b9c955a1eaa49790dae85c5d723f54c95986352b329f",
        rejectedAttemptCount: 0,
      },
      {
        seed: "seed-alpha",
        acceptedAttempt: 0,
        topologyHash: "57b861c26fec4806a8762a5dc60cfe201256896335964f28101eb4c7c5fa3b55",
        witnessLength: 370,
        witnessTypes: [
          "ACQUIRE_KEY",
          "COLLECT_SOURCE",
          "COMPLETE_QUEST",
          "DEFEAT_GUARDIAN",
          "DISCOVER_DIMENSION",
          "FINAL_BOSS_AVAILABLE",
          "LEARN_ABILITY",
          "REACH_OLYMPUS",
          "START",
          "TRAVERSE_TRANSITION",
          "UNLOCK_GATE",
        ],
        preflightPlaneCount: 112,
        startPlaneHash: "c09847030208717d20e49dbe33a6880f2c8c8202c1e99b210c1b299a22e20fc0",
        olympusPlaneHash: "5c633b92ef1501f1903639caaee632a0128b1ed24544ce65ce3f4abdfab891de",
        rejectedAttemptCount: 0,
      },
    ]);
  });
});

describe("headless seed sweep", () => {
  const count = Number(process.env.TIGHT_SEED_SWEEP ?? "8");

  it(`accepts ${count} deterministic seeds`, () => {
    const maxAttempts = Number(process.env.TIGHT_SEED_SWEEP_ATTEMPTS ?? "8");
    const report = sweepAcceptedWorlds(deterministicSweepSeeds(count), "tight-v1", { maxAttempts });
    expect(report.failed).toEqual([]);
    expect(report.accepted).toBe(count);
    expect(report.rows.every((row) => row.topologyHash.length === 64)).toBe(true);
    expect(report.meanWitnessLength).toBeGreaterThan(1);
    expect(Object.keys(report.attemptHistogram).length).toBeGreaterThan(0);
  }, 120_000);
});
