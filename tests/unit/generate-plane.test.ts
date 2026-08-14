import { describe, expect, it } from "vitest";
import {
  carveShortestConnector,
  chooseClosestBoundaryPair,
  finalizePlaneGeometry,
  generatePlaneBase,
  OLYMPUS_PLANE,
  STARTING_PLANE,
  type PlaneGenerationResult,
  type WorldTopology,
} from "../../src/core";
import { emptyGrid } from "../../src/core/generation/grid";
import { requiredConnected } from "../../src/core/generation/plane-occupancy";
import type { PlaneGrid } from "../../src/core/generation/plane-types";
import type { ProgressionSource, ShopInstance, TopologyTransition } from "../../src/core/generation/topology-types";

function requirePlane(result: PlaneGenerationResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.plane;
}

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

function containerSource(id: string, plane: WorldTopology["olympusBossInstance"]["plane"]): ProgressionSource {
  return {
    id,
    plane,
    sourceType: "container",
    grants: ["item:bronze_key"],
    requirements: [],
    consumption: false,
    contentReference: "container_chest",
    quantity: 1,
  };
}

function shop(id: string, plane: WorldTopology["olympusBossInstance"]["plane"]): ShopInstance {
  return {
    id,
    shopTypeId: "general_store",
    plane,
    npcInstanceId: null,
    catalogueShopId: id,
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

function occupancyGrid(plane: { terrain: readonly (readonly string[])[]; features: readonly (readonly (string | null)[])[]; wraps: boolean }) {
  return {
    terrain: plane.terrain.map((row) => [...row]),
    features: plane.features.map((row) => [...row]),
    featureOrigin: plane.features.map((row) => row.map(() => null)),
    wraps: plane.wraps,
  };
}

describe("plane generation", () => {
  it("generates exactly 16x16 planes", () => {
    const plane = requirePlane(generatePlaneBase("seed-a", topology(), STARTING_PLANE));
    expect(plane.terrain).toHaveLength(16);
    expect(plane.terrain.every((row) => row.length === 16)).toBe(true);
    expect(plane.features).toHaveLength(16);
  });

  it("is independent of call order", () => {
    const world = topology({
      transitions: [transition("transition.open", STARTING_PLANE, OLYMPUS_PLANE)],
    });
    const firstStart = requirePlane(generatePlaneBase("seed-order", world, STARTING_PLANE));
    const firstOlympus = requirePlane(generatePlaneBase("seed-order", world, OLYMPUS_PLANE));
    const secondOlympus = requirePlane(generatePlaneBase("seed-order", world, OLYMPUS_PLANE));
    const secondStart = requirePlane(generatePlaneBase("seed-order", world, STARTING_PLANE));
    expect(firstStart.planeHash).toBe(secondStart.planeHash);
    expect(firstOlympus.planeHash).toBe(secondOlympus.planeHash);
    expect(firstStart).toEqual(secondStart);
  });

  it("places a reachable safe anchor on the starting plane", () => {
    const plane = requirePlane(generatePlaneBase("seed-anchor", topology(), STARTING_PLANE));
    const anchor = plane.namedPoints.find((point) => point.kind === "anchor");
    const approach = plane.namedPoints.find((point) => point.kind === "approach");
    expect(anchor).toBeDefined();
    expect(approach).toBeDefined();
    expect(plane.features[anchor!.y]![anchor!.x]).toBe("safe_anchor");
    expect(Math.abs(anchor!.x - approach!.x) + Math.abs(anchor!.y - approach!.y)).toBe(1);
    const grid = occupancyGrid(plane);
    expect(requiredConnected(grid, [{ x: approach!.x, y: approach!.y }], plane.wraps)).toBe(true);
  });

  it("places olympus arena points", () => {
    const plane = requirePlane(generatePlaneBase("seed-olympus", topology(), OLYMPUS_PLANE));
    expect(plane.family).toBe("olympus");
    expect(plane.namedPoints.some((point) => point.kind === "playerEntry")).toBe(true);
    expect(plane.namedPoints.some((point) => point.kind === "bossSpawn")).toBe(true);
  });

  it("keeps required transitions occupiable and connected", () => {
    const world = topology({
      transitions: [transition("transition.open", STARTING_PLANE, OLYMPUS_PLANE)],
    });
    const plane = requirePlane(generatePlaneBase("seed-door", world, STARTING_PLANE));
    expect(plane.transitionFixtures).toHaveLength(1);
    const fixture = plane.transitionFixtures[0]!;
    expect(plane.features[fixture.y]![fixture.x]).toBe("transition_fixture");
    const cells = [
      { x: fixture.x, y: fixture.y },
      ...plane.namedPoints.filter((point) => point.kind === "approach").map((point) => ({ x: point.x, y: point.y })),
    ];
    expect(requiredConnected(occupancyGrid(plane), cells, false)).toBe(true);
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
    const plane = requirePlane(generatePlaneBase("seed-wrap", world, arcane));
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
    const first = requirePlane(generatePlaneBase("seed-repair", world, dungeon));
    const second = requirePlane(generatePlaneBase("seed-repair", world, dungeon));
    expect(first.planeHash).toBe(second.planeHash);
    expect(first.terrain.flat().some((tile) => tile === "cave_floor")).toBe(true);
  });

  it("places a blocking container with a distinct reachable approach cell", () => {
    const world = topology({
      transitions: [transition("transition.open", STARTING_PLANE, OLYMPUS_PLANE)],
      progressionSources: [containerSource("source.chest.start", STARTING_PLANE)],
    });
    const plane = requirePlane(generatePlaneBase("seed-chest", world, STARTING_PLANE));
    const object = plane.namedPoints.find((point) => point.id === "source.chest.start");
    const approach = plane.namedPoints.find((point) => point.id === "source.chest.start.approach");
    expect(object).toBeDefined();
    expect(approach).toBeDefined();
    expect(plane.features[object!.y]![object!.x]).toBe("container_chest");
    expect(object!.x === approach!.x && object!.y === approach!.y).toBe(false);
    expect(Math.abs(object!.x - approach!.x) + Math.abs(object!.y - approach!.y)).toBe(1);
    expect(plane.features[approach!.y]![approach!.x]).toBeNull();
    const cells = [
      { x: approach!.x, y: approach!.y },
      ...plane.namedPoints.filter((point) => point.kind === "transition").map((point) => ({ x: point.x, y: point.y })),
    ];
    expect(requiredConnected(occupancyGrid(plane), cells, false)).toBe(true);
  });

  it("places shopkeeper, counter and occupiable customer geometry", () => {
    const world = topology({
      transitions: [transition("transition.open", STARTING_PLANE, OLYMPUS_PLANE)],
      shopInstances: [shop("shop.start", STARTING_PLANE)],
    });
    const plane = requirePlane(generatePlaneBase("seed-shop", world, STARTING_PLANE));
    const counter = plane.namedPoints.find((point) => point.kind === "counter");
    const shopkeeper = plane.namedPoints.find((point) => point.kind === "shopkeeper");
    const customer = plane.namedPoints.find((point) => point.kind === "customer");
    expect(counter).toBeDefined();
    expect(shopkeeper).toBeDefined();
    expect(customer).toBeDefined();
    expect(plane.features[counter!.y]![counter!.x]).toBe("counter");
    expect(Math.abs(counter!.x - shopkeeper!.x) + Math.abs(counter!.y - shopkeeper!.y)).toBe(1);
    expect(Math.abs(counter!.x - customer!.x) + Math.abs(counter!.y - customer!.y)).toBe(1);
    expect(plane.features[customer!.y]![customer!.x]).toBeNull();
    const cells = [
      { x: customer!.x, y: customer!.y },
      ...plane.namedPoints.filter((point) => point.kind === "transition" || point.kind === "approach").map((point) => ({ x: point.x, y: point.y })),
    ];
    expect(requiredConnected(occupancyGrid(plane), cells, false)).toBe(true);
  });

  it("accepts a plane that has both a required source and a shop after final validation", () => {
    const world = topology({
      transitions: [transition("transition.open", STARTING_PLANE, OLYMPUS_PLANE)],
      progressionSources: [containerSource("source.chest.start", STARTING_PLANE)],
      shopInstances: [shop("shop.start", STARTING_PLANE)],
    });
    const result = generatePlaneBase("seed-source-shop", world, STARTING_PLANE);
    const plane = requirePlane(result);
    expect(plane.namedPoints.some((point) => point.kind === "source")).toBe(true);
    expect(plane.namedPoints.some((point) => point.kind === "customer")).toBe(true);
    expect(plane.planeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns explicit geometry failure instead of a hashed PlaneBase", () => {
    const grid: PlaneGrid = {
      terrain: emptyGrid("grass"),
      features: emptyGrid<string | null>(null),
      featureOrigin: emptyGrid<PlaneGrid["featureOrigin"][number][number]>(null),
    };
    for (let y = 0; y < 16; y += 1) {
      grid.features[y]![8] = "boulder";
      grid.featureOrigin[y]![8] = "required";
    }
    const result = finalizePlaneGeometry({
      generatorVersion: "tight-v1",
      worldSeed: "fail-fixture",
      plane: STARTING_PLANE,
      family: "aboveground",
      wraps: false,
      baseTile: "grass",
      grid,
      namedPoints: [
        { id: "left.approach", kind: "approach", x: 0, y: 8 },
        { id: "right.approach", kind: "approach", x: 15, y: 8 },
      ],
      transitionFixtures: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    expect(result.code).toBe("PLANE_GEOMETRY_FAILURE");
    expect("planeHash" in result).toBe(false);
    expect(result.issues.some((issue) => issue.validator === "required_points_connected")).toBe(true);
  });
});

describe("carve_shortest_connector", () => {
  function rockGrid(): PlaneGrid {
    return {
      terrain: emptyGrid("solid_rock"),
      features: emptyGrid<string | null>(null),
      featureOrigin: emptyGrid<PlaneGrid["featureOrigin"][number][number]>(null),
    };
  }

  it("selects the closest component-boundary pair, not the first required point", () => {
    const grid = rockGrid();
    const required = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
    ];
    for (const cell of required) {
      grid.terrain[cell.y]![cell.x] = "cave_floor";
    }
    const pair = chooseClosestBoundaryPair(grid, false, required);
    expect(pair).toEqual({ source: { x: 10, y: 0 }, dest: { x: 10, y: 2 }, distance: 2 });
    const carved = carveShortestConnector(grid, false, "cave_floor", required);
    expect(carved).not.toBeNull();
    expect(grid.terrain[1]![10]).toBe("cave_floor");
    expect(grid.terrain[0]![5]).toBe("solid_rock");
  });

  it("uses the (distance, sourceY, sourceX, destY, destX) tie rule", () => {
    const grid = rockGrid();
    const required = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 6 },
      { x: 6, y: 6 },
    ];
    for (const cell of required) {
      grid.terrain[cell.y]![cell.x] = "cave_floor";
    }
    const pair = chooseClosestBoundaryPair(grid, false, required);
    expect(pair).toEqual({ source: { x: 4, y: 4 }, dest: { x: 6, y: 4 }, distance: 2 });
  });
});
