import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyPlayerCommand,
  applyStatus,
  arrivalCellFor,
  createAcceptedWorldCache,
  createMonsterActor,
  createNewGame,
  destinationCoordinate,
  hashSaveState,
  playerActor,
  type GameRuntime,
  type IntentionalAction,
} from "../../src/core";
import { emptyGrid } from "../../src/core/generation/grid";
import type { PlaneBase } from "../../src/core/generation/plane-types";
import type { TopologyTransition } from "../../src/core/generation/topology-types";
import type { FamilyId } from "../../src/core/model/ids";
import { planeKey, type PlanePair } from "../../src/core/model/plane";

const cache = createAcceptedWorldCache();
const START: PlanePair = { a: 0, b: 1 };
const NEXT: PlanePair = { a: 1, b: 2 };
const THIRD: PlanePair = { a: 0, b: 2 };

function newGame(seed = "0") {
  return createNewGame("tight-v1", seed, { cache });
}

function queue(runtime: GameRuntime, action: IntentionalAction) {
  return applyPlayerCommand(runtime, { type: "queue", action });
}

function grassPlane(plane: PlanePair, family: FamilyId, fixtures: PlaneBase["transitionFixtures"] = []): PlaneBase {
  const features = emptyGrid<string | null>(null);
  for (const fixture of fixtures) {
    features[fixture.y]![fixture.x] = "transition_fixture";
  }
  return {
    generatorVersion: "tight-v1",
    worldSeed: "0",
    plane,
    family,
    wraps: false,
    terrain: emptyGrid("grass"),
    features,
    namedPoints: [],
    spawnRegions: [],
    transitionFixtures: fixtures,
    repairs: [],
    planeHash: `test:${planeKey(plane)}`,
  };
}

function transitionRow(
  id: string,
  source: PlanePair,
  destination: PlanePair,
  extras: Partial<TopologyTransition> = {},
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
    ...extras,
  };
}

function installWorld(
  runtime: GameRuntime,
  source: PlaneBase,
  dest: PlaneBase,
  transitions: TopologyTransition[],
): void {
  runtime.topology = { ...runtime.topology, transitions };
  runtime.currentPlaneBase = source;
  runtime.save.plane = { ...source.plane };
  runtime.save.family = source.family;
  const player = playerActor(runtime);
  player.plane = { ...source.plane };
  runtime.planeCache.set(planeKey(source.plane), source);
  runtime.planeCache.set(planeKey(dest.plane), dest);
}

function tick(runtime: GameRuntime) {
  return advanceTick(runtime);
}

function runtimeWait(runtime: GameRuntime, ticks: number) {
  for (let i = 0; i < ticks; i += 1) {
    queue(runtime, { type: "wait" });
    tick(runtime);
  }
}

describe("destination coordinate modes", () => {
  it("preserves the shared-dimension coordinate for fixed, source-axis-copy, and derived modes", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.x = 7;
    player.y = 12;
    const source = grassPlane(START, "aboveground", [{ transitionId: "t.fixed", x: 8, y: 12 }]);
    const dest = grassPlane(NEXT, "inside");
    const fixed = transitionRow("t.fixed", START, NEXT, { coordinateMode: "fixed", transitionEffectProfileId: "fixed_gate" });
    const copied = transitionRow("t.copied", START, NEXT, {
      archetypeId: "hole",
      coordinateMode: "source_axis_copy",
      transitionEffectProfileId: "copied_gate",
    });
    const derived = transitionRow("t.derived", START, NEXT, {
      archetypeId: "mirror",
      coordinateMode: "deterministic_derived",
      transitionEffectProfileId: "derived_gate",
    });
    installWorld(runtime, source, dest, [fixed, copied, derived]);

    const fixedCoord = destinationCoordinate(runtime, fixed, player, { x: 8, y: 12 });
    const copiedCoord = destinationCoordinate(runtime, copied, player, { x: 8, y: 12 });
    const derivedCoord = destinationCoordinate(runtime, derived, player, { x: 8, y: 12 });
    expect(fixedCoord).toBeGreaterThanOrEqual(0);
    expect(fixedCoord).toBeLessThan(16);
    expect(copiedCoord).toBe(7);
    expect(derivedCoord).toBeGreaterThanOrEqual(0);
    expect(derivedCoord).toBeLessThan(16);
    expect(derivedCoord).not.toBe(fixedCoord);

    const expectedFixed = arrivalCellFor(runtime, fixed, player, { x: 8, y: 12 });
    expect(expectedFixed.x).toBe(12);
    expect(expectedFixed.y).toBe(fixedCoord);

    const expectedCopied = arrivalCellFor(runtime, copied, player, { x: 8, y: 12 });
    expect(expectedCopied).toEqual({ x: 12, y: 7 });

    installWorld(runtime, source, dest, [fixed]);
    queue(runtime, { type: "interact", targetId: "transition_fixture", targetX: 8, targetY: 12 });
    const result = tick(runtime);
    expect(result.events.some((event) => event.type === "transition_activated")).toBe(true);
    expect(playerActor(runtime)).toMatchObject({ plane: NEXT, x: expectedFixed.x, y: expectedFixed.y });
  });
});

describe("transition activation and blocking", () => {
  it("consumes a dynamically blocked interact attempt without leaving the plane", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.x = 5;
    player.y = 5;
    const source = grassPlane(START, "aboveground", [{ transitionId: "t.door", x: 6, y: 5 }]);
    const dest = grassPlane(NEXT, "inside");
    const row = transitionRow("t.door", START, NEXT);
    installWorld(runtime, source, dest, [row]);
    const arrival = arrivalCellFor(runtime, row, player, { x: 6, y: 5 });
    const blocker = createMonsterActor("block.1", "rat", NEXT, arrival.x, arrival.y);
    runtime.save.actors.push(blocker);
    const before = { x: player.x, y: player.y, plane: { ...player.plane }, tick: runtime.save.tick };
    queue(runtime, { type: "interact", targetId: "transition_fixture", targetX: 6, targetY: 5 });
    const result = tick(runtime);
    expect(result.advanced).toBe(true);
    expect(result.events.some((event) => event.type === "action_failed" && event.detail === "blocked")).toBe(true);
    expect(playerActor(runtime).plane).toEqual(before.plane);
    expect(playerActor(runtime).x).toBe(before.x);
    expect(playerActor(runtime).y).toBe(before.y);
    expect(runtime.save.tick).toBe(before.tick + 1);
  });

  it("refuses a statically broken transit", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.x = 5;
    player.y = 5;
    const source = grassPlane(START, "aboveground", [{ transitionId: "t.broken", x: 6, y: 5 }]);
    const dest = grassPlane(NEXT, "inside");
    installWorld(
      runtime,
      source,
      dest,
      [transitionRow("t.broken", START, NEXT, { initiallyBroken: true, progressionClass: "optional_broken" })],
    );
    queue(runtime, { type: "interact", targetId: "transition_fixture", targetX: 6, targetY: 5 });
    const result = tick(runtime);
    expect(result.events.some((event) => event.type === "action_failed" && event.detail === "broken")).toBe(true);
    expect(playerActor(runtime).plane).toEqual(START);
  });

  it("activates step-on and edge-cross modes", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.x = 5;
    player.y = 5;
    const hole = transitionRow("t.hole", START, NEXT, {
      archetypeId: "hole",
      coordinateMode: "source_axis_copy",
      transitionEffectProfileId: "copied_gate",
    });
    const source = grassPlane(START, "aboveground", [{ transitionId: "t.hole", x: 6, y: 5 }]);
    const dest = grassPlane(NEXT, "inside");
    installWorld(runtime, source, dest, [hole]);
    queue(runtime, { type: "move", direction: "east" });
    const stepped = tick(runtime);
    expect(stepped.events.some((event) => event.type === "transition_activated" && event.targetId === "t.hole")).toBe(true);
    expect(playerActor(runtime).plane).toEqual(NEXT);
    expect(runtime.save.consumedTransitionIds).toContain("t.hole");

    const edgeRuntime = newGame();
    const edgePlayer = playerActor(edgeRuntime);
    edgePlayer.x = 15;
    edgePlayer.y = 8;
    const edge = transitionRow("t.edge", START, NEXT, {
      archetypeId: "map_edge_passage",
      coordinateMode: "deterministic_derived",
      transitionEffectProfileId: "derived_gate",
    });
    const edgeSource = grassPlane(START, "aboveground", [{ transitionId: "t.edge", x: 15, y: 8 }]);
    const edgeDest = grassPlane(NEXT, "inside");
    installWorld(edgeRuntime, edgeSource, edgeDest, [edge]);
    queue(edgeRuntime, { type: "move", direction: "east" });
    const crossed = tick(edgeRuntime);
    expect(crossed.events.some((event) => event.type === "transition_activated" && event.targetId === "t.edge")).toBe(true);
    expect(playerActor(edgeRuntime).plane).toEqual(NEXT);
  });

  it("clears Space velocity on exit and does not imply a return transit", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.x = 4;
    player.y = 4;
    player.vx = 2;
    player.vy = -1;
    runtime.save.family = "space";
    const source = grassPlane(START, "space", [{ transitionId: "t.airlock", x: 5, y: 4 }]);
    const dest = grassPlane(NEXT, "inside");
    installWorld(runtime, source, dest, [
      transitionRow("t.airlock", START, NEXT, { archetypeId: "airlock", transitionEffectProfileId: "fixed_gate" }),
    ]);
    queue(runtime, { type: "interact", targetId: "transition_fixture", targetX: 5, targetY: 4 });
    const result = tick(runtime);
    expect(result.events.some((event) => event.type === "velocity_cleared")).toBe(true);
    expect(playerActor(runtime).vx).toBe(0);
    expect(playerActor(runtime).vy).toBe(0);
    expect(dest.transitionFixtures).toHaveLength(0);
    queue(runtime, { type: "interact" });
    const back = tick(runtime);
    expect(back.events.some((event) => event.type === "transition_activated")).toBe(false);
    expect(playerActor(runtime).plane).toEqual(NEXT);
  });
});

describe("discovery", () => {
  it("records each new dimension and plane exactly once", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.x = 3;
    player.y = 3;
    const first = transitionRow("t.1", START, NEXT);
    const second = transitionRow("t.2", NEXT, THIRD);
    const source = grassPlane(START, "aboveground", [{ transitionId: "t.1", x: 4, y: 3 }]);
    const mid = grassPlane(NEXT, "inside", [{ transitionId: "t.2", x: 0, y: 0 }]);
    const end = grassPlane(THIRD, "inside");
    installWorld(runtime, source, mid, [first, second]);
    runtime.planeCache.set(planeKey(THIRD), end);
    expect(runtime.save.discoveredDimensions).toEqual([0, 1]);

    queue(runtime, { type: "interact", targetId: "transition_fixture", targetX: 4, targetY: 3 });
    const firstTick = tick(runtime);
    expect(firstTick.events.filter((event) => event.type === "dimension_discovered").map((event) => event.amount)).toEqual([2]);
    expect(firstTick.events.some((event) => event.type === "plane_visited" && event.detail === "1,2")).toBe(true);
    expect(runtime.save.discoveredDimensions).toEqual([0, 1, 2]);
    expect(runtime.save.discoveredPlanes.some((plane) => planeKey(plane) === "1,2")).toBe(true);

    const arrived = playerActor(runtime);
    arrived.x = 0;
    arrived.y = 1;
    queue(runtime, { type: "interact", targetId: "transition_fixture", targetX: 0, targetY: 0 });
    const secondTick = tick(runtime);
    expect(secondTick.events.filter((event) => event.type === "dimension_discovered")).toHaveLength(0);
    expect(secondTick.events.some((event) => event.type === "plane_visited" && event.detail === "0,2")).toBe(true);
    expect(runtime.save.discoveredDimensions).toEqual([0, 1, 2]);
  });
});

describe("pursuit handoff", () => {
  function chaseSetup() {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.x = 6;
    player.y = 5;
    const source = grassPlane(START, "aboveground", [{ transitionId: "t.door", x: 7, y: 5 }]);
    const dest = grassPlane(NEXT, "inside");
    const row = transitionRow("t.door", START, NEXT);
    installWorld(runtime, source, dest, [row]);
    const wolf = createMonsterActor("wolf.1", "wolf", START, 5, 5);
    wolf.aiState = "chasing";
    runtime.save.actors.push(wolf);
    runtime.scriptedActions.set("wolf.1", { type: "wait" });
    return { runtime, player, wolf, row };
  }

  it("creates a handoff, arrives after the profile delay, and fails when the arrival tile is occupied", () => {
    const blocked = chaseSetup();
    queue(blocked.runtime, { type: "interact", targetId: "transition_fixture", targetX: 7, targetY: 5 });
    const left = tick(blocked.runtime);
    expect(left.events.some((event) => event.type === "pursuit_started" && event.actorId === "wolf.1")).toBe(true);
    expect(blocked.runtime.save.pursuits).toHaveLength(1);
    expect(blocked.runtime.save.pursuits[0]?.remainingDelay).toBe(2);
    expect(blocked.wolf.plane).toEqual(START);

    tick(blocked.runtime);
    expect(blocked.runtime.save.pursuits[0]?.remainingDelay).toBe(1);
    const occupied = tick(blocked.runtime);
    expect(occupied.events.some((event) => event.type === "pursuit_cancelled")).toBe(true);
    expect(blocked.wolf.plane).toEqual(START);
    expect(blocked.runtime.save.pursuits).toHaveLength(0);

    const open = chaseSetup();
    const openArrival = arrivalCellFor(open.runtime, open.row, open.player, { x: 7, y: 5 });
    queue(open.runtime, { type: "interact", targetId: "transition_fixture", targetX: 7, targetY: 5 });
    tick(open.runtime);
    const landed = playerActor(open.runtime);
    queue(open.runtime, { type: "move", direction: landed.x < 15 ? "east" : "west" });
    tick(open.runtime);
    queue(open.runtime, { type: "wait" });
    const arrived = tick(open.runtime);
    expect(arrived.events.some((event) => event.type === "pursuit_arrived" && event.actorId === "wolf.1")).toBe(true);
    expect(open.wolf.plane).toEqual(NEXT);
    expect(open.wolf.x).toBe(openArrival.x);
    expect(open.wolf.y).toBe(openArrival.y);
  });

  it("cancels by default if the player leaves before arrival", () => {
    const setup = chaseSetup();
    const second = transitionRow("t.2", NEXT, THIRD);
    setup.runtime.topology = { ...setup.runtime.topology, transitions: [...setup.runtime.topology.transitions, second] };
    const mid = grassPlane(NEXT, "inside", [{ transitionId: "t.2", x: 1, y: 1 }]);
    const end = grassPlane(THIRD, "inside");
    setup.runtime.planeCache.set(planeKey(NEXT), mid);
    setup.runtime.planeCache.set(planeKey(THIRD), end);
    setup.runtime.currentPlaneBase = grassPlane(START, "aboveground", [{ transitionId: "t.door", x: 7, y: 5 }]);
    setup.runtime.planeCache.set(planeKey(START), setup.runtime.currentPlaneBase);

    queue(setup.runtime, { type: "interact", targetId: "transition_fixture", targetX: 7, targetY: 5 });
    tick(setup.runtime);
    expect(setup.runtime.save.pursuits).toHaveLength(1);
    const player = playerActor(setup.runtime);
    player.x = 1;
    player.y = 2;
    queue(setup.runtime, { type: "interact", targetId: "transition_fixture", targetX: 1, targetY: 1 });
    const left = tick(setup.runtime);
    expect(left.events.some((event) => event.type === "pursuit_cancelled" && event.actorId === "wolf.1")).toBe(true);
    expect(setup.runtime.save.pursuits).toHaveLength(0);
    expect(setup.wolf.plane).toEqual(START);
  });

  it("does not simulate frozen source-plane actors", () => {
    const setup = chaseSetup();
    applyStatus(setup.wolf, "poisoned", null, []);
    const remaining = setup.wolf.statuses[0]?.remainingTicks;
    expect(remaining).toBeGreaterThan(1);
    queue(setup.runtime, { type: "interact", targetId: "transition_fixture", targetX: 7, targetY: 5 });
    tick(setup.runtime);
    const frozen = { x: setup.wolf.x, y: setup.wolf.y };
    runtimeWait(setup.runtime, 3);
    expect(setup.wolf.x).toBe(frozen.x);
    expect(setup.wolf.y).toBe(frozen.y);
    expect(setup.wolf.plane).toEqual(START);
    expect(setup.wolf.statuses[0]?.remainingTicks).toBe(remaining);
  });
});

describe("milestone B scenario", () => {
  it("moves, fights, uses an item, crosses a plane, discovers, and pursues with a stable hash", () => {
    const run = () => {
      const runtime = newGame();
      const player = playerActor(runtime);
      queue(runtime, { type: "move", direction: "east" });
      tick(runtime);
      queue(runtime, { type: "move", direction: "south" });
      tick(runtime);
      const rat = createMonsterActor("rat.1", "rat", runtime.save.plane, player.x + 1, player.y);
      runtime.save.actors.push(rat);
      runtime.scriptedActions.set("rat.1", { type: "wait" });
      queue(runtime, { type: "attack", attackId: "sword_slash", targetId: "rat.1" });
      tick(runtime);
      const herbsBefore = runtime.save.player.inventory.find((row) => row.itemId === "healing_herb")?.quantity ?? 0;
      queue(runtime, { type: "item", itemId: "healing_herb" });
      const used = tick(runtime);
      expect(used.events.some((event) => event.type === "item_used")).toBe(true);
      expect(runtime.save.player.inventory.find((row) => row.itemId === "healing_herb")?.quantity ?? 0).toBe(herbsBefore - 1);

      player.x = 6;
      player.y = 5;
      const source = grassPlane(START, "aboveground", [{ transitionId: "t.door", x: 7, y: 5 }]);
      const dest = grassPlane(NEXT, "inside");
      const row = transitionRow("t.door", START, NEXT);
      installWorld(runtime, source, dest, [row]);
      const wolf = createMonsterActor("wolf.1", "wolf", START, 5, 5);
      wolf.aiState = "chasing";
      runtime.save.actors.push(wolf);
      runtime.scriptedActions.set("wolf.1", { type: "wait" });
      const arrival = arrivalCellFor(runtime, row, player, { x: 7, y: 5 });
      queue(runtime, { type: "interact", targetId: "transition_fixture", targetX: 7, targetY: 5 });
      const crossed = tick(runtime);
      expect(crossed.events.some((event) => event.type === "transition_activated")).toBe(true);
      expect(crossed.events.some((event) => event.type === "dimension_discovered")).toBe(true);
      expect(crossed.events.some((event) => event.type === "pursuit_started")).toBe(true);
      const landed = playerActor(runtime);
      queue(runtime, { type: "move", direction: landed.x < 15 ? "east" : "west" });
      tick(runtime);
      queue(runtime, { type: "wait" });
      const followed = tick(runtime);
      expect(followed.events.some((event) => event.type === "pursuit_arrived")).toBe(true);
      expect(wolf.plane).toEqual(NEXT);
      expect(wolf.x).toBe(arrival.x);
      expect(wolf.y).toBe(arrival.y);
      return hashSaveState(runtime.save);
    };

    const first = run();
    const second = run();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(16);
  });
});
