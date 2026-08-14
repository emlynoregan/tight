import { describe, expect, it } from "vitest";
import {
  generateTopology,
  potentialNeighbours,
  sharesExactlyOneDimension,
  STARTING_PLANE,
} from "../../src/core";

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
    const first = generateTopology("seed-alpha", 0);
    const second = generateTopology("seed-alpha", 0);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.topology.planeNodes).toHaveLength(120);
    expect(first.topology.topologyHash).toBe(second.topology.topologyHash);
    expect(first.topology.transitions.every((row) => sharesExactlyOneDimension(row.sourcePlane, row.destinationPlane))).toBe(true);
    const ids = [
      ...first.topology.transitions.map((row) => row.id),
      ...first.topology.gates.map((row) => row.id),
      ...first.topology.progressionSources.map((row) => row.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const startOpen = first.topology.transitions.filter(
      (row) => row.sourcePlane.a === 0 && row.sourcePlane.b === 1 && !row.initiallyBroken && row.progressionClass === "open",
    );
    expect(startOpen.length).toBeGreaterThanOrEqual(3);
    const olympusInbound = new Set(
      first.topology.transitions
        .filter((row) => row.destinationPlane.a === 14 && row.destinationPlane.b === 15)
        .map((row) => `${row.sourcePlane.a},${row.sourcePlane.b}`),
    );
    expect(olympusInbound.size).toBeGreaterThanOrEqual(2);
    expect(first.topology.olympusBossInstance.monsterId).toBe("olympian_final");
  });

  it("changes topology when the attempt changes", () => {
    const a = generateTopology("seed-alpha", 0);
    const b = generateTopology("seed-alpha", 1);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) {
      return;
    }
    expect(a.topology.topologyHash).not.toBe(b.topology.topologyHash);
  });

  it("fails explicitly for an out-of-range attempt", () => {
    const result = generateTopology("seed-alpha", 4096);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("TOPOLOGY_ATTEMPT_LIMIT_EXCEEDED");
  });
});
