import { describe, expect, it } from "vitest";
import {
  canonicalizeTopology,
  compareStableIds,
  generateTopology,
  hashTopology,
  planeEligibleForArchetype,
  potentialNeighbours,
  sharesExactlyOneDimension,
  STARTING_PLANE,
  validateTopology,
  CONTENT_REGISTRY,
} from "../../src/core";
import type { WorldTopology } from "../../src/core";

function requireTopology(seed: string, attempt = 0): WorldTopology {
  const result = generateTopology(seed, attempt);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.topology;
}

describe("topology neighbours", () => {
  it("gives every plane exactly 28 one-dimension neighbours", () => {
    const neighbours = potentialNeighbours(STARTING_PLANE);
    expect(neighbours).toHaveLength(28);
    expect(new Set(neighbours.map((plane) => `${plane.a},${plane.b}`)).size).toBe(28);
    expect(neighbours.every((plane) => sharesExactlyOneDimension(STARTING_PLANE, plane))).toBe(true);
  });
});

describe("topology generator", () => {
  it("generates a structurally valid 120-plane candidate deterministically", () => {
    const first = requireTopology("seed-alpha", 0);
    const second = requireTopology("seed-alpha", 0);
    expect(first.planeNodes).toHaveLength(120);
    expect(first.topologyHash).toBe(second.topologyHash);
    expect(first.transitions.every((row) => sharesExactlyOneDimension(row.sourcePlane, row.destinationPlane))).toBe(true);
    expect(first.ordinaryEncounterDropsAreSolverVisible).toBe(false);
    expect(first.shopInstances.some((shop) => shop.catalogueShopId === "shop_start")).toBe(true);
    const ids = [
      ...first.transitions.map((row) => row.id),
      ...first.gates.map((row) => row.id),
      ...first.progressionSources.map((row) => row.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const startOpen = first.transitions.filter(
      (row) => row.sourcePlane.a === 0 && row.sourcePlane.b === 1 && !row.initiallyBroken && row.progressionClass === "open",
    );
    expect(startOpen.length).toBeGreaterThanOrEqual(3);
    const olympusInbound = new Set(
      first.transitions
        .filter((row) => row.destinationPlane.a === 14 && row.destinationPlane.b === 15)
        .map((row) => `${row.sourcePlane.a},${row.sourcePlane.b}`),
    );
    expect(olympusInbound.size).toBeGreaterThanOrEqual(2);
    expect(first.olympusBossInstance.monsterId).toBe("olympian_final");
  });

  it("changes topology when the attempt changes", () => {
    const a = requireTopology("seed-alpha", 0);
    const b = requireTopology("seed-alpha", 1);
    expect(a.topologyHash).not.toBe(b.topologyHash);
  });

  it("fails explicitly for an out-of-range attempt", () => {
    const result = generateTopology("seed-alpha", 4096);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("TOPOLOGY_ATTEMPT_LIMIT_EXCEEDED");
  });

  it("covers each progression class across a modest seed sweep", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 40 && seen.size < 7; n += 1) {
      const topology = requireTopology(`class-sweep-${n}`, 0);
      for (const row of topology.transitions) {
        seen.add(row.progressionClass);
      }
    }
    for (const progressionClass of ["open", "guardian_gate", "key_gate", "resource_gate", "ability_gate", "quest_flag_gate", "optional_broken"]) {
      expect(seen.has(progressionClass)).toBe(true);
    }
  });

  it("places named NPCs only on eligible planes and keeps quests on the NPC plane", () => {
    const topology = requireTopology("seed-alpha", 0);
    for (const npc of topology.npcInstances) {
      const story = CONTENT_REGISTRY.byId.storyNpc.get(npc.npcId);
      if (!story) {
        continue;
      }
      const archetype = CONTENT_REGISTRY.byId.npcArchetype.get(story.archetypeId)!;
      expect(planeEligibleForArchetype(npc.plane, archetype)).toBe(true);
    }
    for (const quest of topology.questInstances) {
      if (!quest.npcId) {
        continue;
      }
      const npc = topology.npcInstances.find((row) => row.id === quest.npcId);
      expect(npc).toBeDefined();
      expect(npc?.plane).toEqual(quest.plane);
    }
    const divine = topology.progressionSources.find((source) => source.grants.includes("ability:divine_passage"));
    if (divine) {
      expect(divine.requirements.every((token) => !token.includes("q_olympus") && !token.includes("final_boss"))).toBe(true);
    }
  });

  it("rejects dangling generated condition and gate references", () => {
    const topology = requireTopology("seed-alpha", 0);
    const withCondition = {
      ...topology,
      transitions: topology.transitions.map((row, index) =>
        index === 0 ? { ...row, conditionSetId: "condition.missing" } : row,
      ),
    };
    expect(validateTopology(withCondition).some((issue) => issue.includes("dangling conditionSetId"))).toBe(true);

    const gated = topology.transitions.find((row) => row.gateId);
    if (gated?.gateId) {
      const withoutGate = {
        ...topology,
        gates: topology.gates.filter((gate) => gate.id !== gated.gateId),
      };
      expect(validateTopology(withoutGate).some((issue) => issue.includes("missing gate"))).toBe(true);
    }

    const mara = CONTENT_REGISTRY.byId.npcArchetype.get("scholar")!;
    expect(planeEligibleForArchetype(STARTING_PLANE, mara)).toBe(false);
    const illegalNpc = {
      ...topology,
      npcInstances: [{ id: "npc.mara_guide.illegal", npcId: "mara_guide", plane: STARTING_PLANE }, ...topology.npcInstances],
    };
    expect(validateTopology(illegalNpc).some((issue) => issue.includes("outside eligible dimensions"))).toBe(true);
  });

  it("hashes with canonical stable-ID ordering independent of input array order", () => {
    const topology = requireTopology("seed-alpha", 0);
    const { topologyHash: _hash, ...rest } = topology;
    void _hash;
    const reversed = {
      ...rest,
      transitions: [...rest.transitions].reverse(),
      gates: [...rest.gates].reverse(),
      progressionSources: [...rest.progressionSources].reverse(),
    };
    expect(hashTopology(reversed)).toBe(topology.topologyHash);
    expect(compareStableIds("Gate", "gate")).toBe(0);
    const canonical = canonicalizeTopology(rest);
    expect(canonical.transitions.map((row) => row.id)).toEqual(
      [...rest.transitions].sort((left, right) => compareStableIds(left.id, right.id)).map((row) => row.id),
    );
  });

  it("structurally validates a 100-seed sweep", () => {
    for (let n = 0; n < 100; n += 1) {
      const result = generateTopology(`sweep-${n}`, 0);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`sweep-${n}: ${result.message}`);
      }
      expect(validateTopology(result.topology)).toEqual([]);
      expect(result.topology.transitions.every((row) => row.conditionSetId === null)).toBe(true);
    }
  }, 120_000);
});
