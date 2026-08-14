import { describe, expect, it } from "vitest";
import {
  createAcceptedWorldCache,
  generatePlaneBase,
  generateTopology,
  getAcceptedWorld,
  OLYMPUS_PLANE,
  STARTING_PLANE,
  summarizeAcceptedWorld,
  sweepAcceptedWorlds,
  deterministicSweepSeeds,
  witnessPlanes,
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
        startPlaneHash: "dfb483a4a17b173ada5167fd8e44865ddebe30829d745031715107efd85a398f",
        olympusPlaneHash: "112b4efa1c41e22c4f8c1b0a64426c864fb278d914f7e7d8baeb3745c4e6a2f5",
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
        startPlaneHash: "c3f6ebd16db90b7141bf164527d6ac6d77c3e670aac3b8d02fcd1c241ecd99f2",
        olympusPlaneHash: "cb611435bfbdc6e0363bbb6fda102fe8aeae54ed6163a83b2794d553b30576c9",
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
        startPlaneHash: "f5cfb953ba8f16247ebd8c1dac8e5c4a2fc50e79d9eb86a42182071c13d7bb88",
        olympusPlaneHash: "065c55c3b6a82d09669b27a219eed6589bf7f697f25f0d898717e99767e0bce5",
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
