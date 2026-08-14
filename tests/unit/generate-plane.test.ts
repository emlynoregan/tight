import { describe, expect, it } from "vitest";
import {
  generatePlaneBase,
  OLYMPUS_PLANE,
  STARTING_PLANE,
  type WorldTopology,
} from "../../src/core";
import { requiredConnected } from "../../src/core/generation/plane-occupancy";
import type { TopologyTransition } from "../../src/core/generation/topology-types";

function transition(
  id: string,
  source: WorldTopology["olympusBossInstance"]["plane"],
  destination: WorldTopology["olympusBossInstance"]["plane"],
): TopologyTransition {
  return {
    id,
    sourcePlane: source,
    destinationPlane: destination,
    archetypeId: "door",
    transitionEffectProfileId: "fixed_gate",
    coordinateMode: "fixed",
    conditionSetId: null,
    gateId: null,
    progressionClass: "open",
    initiallyBroken: false,
    semanticTags: [],
  };
}

function topology(partial: Partial<WorldTopology> = {}): WorldTopology {
  return {
    generatorVersion: "tight-v1",
    worldSeed: "plane-fixture",
    topologyAttempt: 0,
    planeNodes: [
      { plane: STARTING_PLANE, dominantDimension: 1, family: "aboveground", progressionTier: 0 },
      { plane: OLYMPUS_PLANE, dominantDimension: 15, family: "olympus", progressionTier: 7 },
    ],
    transitions: [],
    gates: [],
    progressionSources: [],
    guardianInstances: [],
    questInstances: [],
    npcInstances: [],
    shopInstances: [],
    olympusBossInstance: {
      encounterId: "boss_olympus",
      monsterId: "olympian_final",
      plane: OLYMPUS_PLANE,
      arenaId: "olympus_arena",
    },
    ordinaryEncounterDropsAreSolverVisible: false,
    topologyHash: "fixture",
    ...partial,
  };
}

describe("plane generation", () => {
  it("generates exactly 16x16 planes", () => {
    const plane = generatePlaneBase("seed-a", topology(), STARTING_PLANE);
    expect(plane.terrain).toHaveLength(16);
    expect(plane.terrain.every((row) => row.length === 16)).toBe(true);
    expect(plane.features).toHaveLength(16);
  });

  it("is independent of call order", () => {
    const world = topology({
      transitions: [transition("transition.open", STARTING_PLANE, OLYMPUS_PLANE)],
    });
    const firstStart = generatePlaneBase("seed-order", world, STARTING_PLANE);
    const firstOlympus = generatePlaneBase("seed-order", world, OLYMPUS_PLANE);
    const secondOlympus = generatePlaneBase("seed-order", world, OLYMPUS_PLANE);
    const secondStart = generatePlaneBase("seed-order", world, STARTING_PLANE);
    expect(firstStart.planeHash).toBe(secondStart.planeHash);
    expect(firstOlympus.planeHash).toBe(secondOlympus.planeHash);
    expect(firstStart).toEqual(secondStart);
  });

  it("places a reachable safe anchor on the starting plane", () => {
    const plane = generatePlaneBase("seed-anchor", topology(), STARTING_PLANE);
    const anchor = plane.namedPoints.find((point) => point.kind === "anchor");
    const approach = plane.namedPoints.find((point) => point.kind === "approach");
    expect(anchor).toBeDefined();
    expect(approach).toBeDefined();
    expect(plane.features[anchor!.y]![anchor!.x]).toBe("safe_anchor");
    expect(Math.abs(anchor!.x - approach!.x) + Math.abs(anchor!.y - approach!.y)).toBe(1);
    const grid = {
      terrain: plane.terrain.map((row) => [...row]),
      features: plane.features.map((row) => [...row]),
      featureOrigin: plane.features.map((row) => row.map(() => null)),
    };
    expect(requiredConnected(grid, [{ x: approach!.x, y: approach!.y }], plane.wraps)).toBe(true);
  });

  it("places olympus arena points", () => {
    const plane = generatePlaneBase("seed-olympus", topology(), OLYMPUS_PLANE);
    expect(plane.family).toBe("olympus");
    expect(plane.namedPoints.some((point) => point.kind === "playerEntry")).toBe(true);
    expect(plane.namedPoints.some((point) => point.kind === "bossSpawn")).toBe(true);
  });

  it("keeps required transitions occupiable and connected", () => {
    const world = topology({
      transitions: [transition("transition.open", STARTING_PLANE, OLYMPUS_PLANE)],
    });
    const plane = generatePlaneBase("seed-door", world, STARTING_PLANE);
    expect(plane.transitionFixtures).toHaveLength(1);
    const fixture = plane.transitionFixtures[0]!;
    expect(plane.features[fixture.y]![fixture.x]).toBe("transition_fixture");
    const cells = [
      { x: fixture.x, y: fixture.y },
      ...plane.namedPoints.filter((point) => point.kind === "approach").map((point) => ({ x: point.x, y: point.y })),
    ];
    expect(
      requiredConnected(
        { terrain: plane.terrain.map((row) => [...row]), features: plane.features.map((row) => [...row]), featureOrigin: plane.features.map((row) => row.map(() => null)) },
        cells,
        false,
      ),
    ).toBe(true);
  });

  it("uses wrap connectivity on arcane planes", () => {
    const arcane = { a: 6 as const, b: 7 as const };
    const world = topology({
      planeNodes: [
        { plane: STARTING_PLANE, dominantDimension: 1, family: "aboveground", progressionTier: 0 },
        { plane: arcane, dominantDimension: 7, family: "arcane", progressionTier: 3 },
        { plane: OLYMPUS_PLANE, dominantDimension: 15, family: "olympus", progressionTier: 7 },
      ],
      transitions: [transition("transition.arcane", STARTING_PLANE, arcane)],
    });
    const plane = generatePlaneBase("seed-wrap", world, arcane);
    expect(plane.wraps).toBe(true);
    expect(plane.family).toBe("arcane");
    const open = {
      terrain: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => "arcane_floor")),
      features: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => null as string | null)),
      featureOrigin: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => null)),
    };
    for (let y = 0; y < 16; y += 1) {
      open.terrain[y]![8] = "solid_rock";
    }
    expect(requiredConnected(open, [{ x: 0, y: 8 }, { x: 15, y: 8 }], true)).toBe(true);
    expect(requiredConnected(open, [{ x: 0, y: 8 }, { x: 15, y: 8 }], false)).toBe(false);
  });

  it("repairs dungeon walkability deterministically", () => {
    const dungeon = { a: 4 as const, b: 5 as const };
    const world = topology({
      planeNodes: [
        { plane: dungeon, dominantDimension: 5, family: "dungeon", progressionTier: 2 },
        { plane: OLYMPUS_PLANE, dominantDimension: 15, family: "olympus", progressionTier: 7 },
      ],
      transitions: [transition("transition.dungeon", dungeon, OLYMPUS_PLANE)],
    });
    const first = generatePlaneBase("seed-repair", world, dungeon);
    const second = generatePlaneBase("seed-repair", world, dungeon);
    expect(first.planeHash).toBe(second.planeHash);
    expect(first.terrain.flat().some((tile) => tile === "cave_floor")).toBe(true);
  });
});
