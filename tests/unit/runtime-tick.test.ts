import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyPlayerCommand,
  createAcceptedWorldCache,
  createNewGame,
  generatePlaneBase,
  getAcceptedWorld,
  hashSaveState,
  initiativeOrder,
  planeKey,
  playerActor,
  proofRequiredFixtures,
  STARTING_PLANE,
  type ActorState,
  type IntentionalAction,
  type PlaneGenerationResult,
  type PlanePair,
} from "../../src/core";

const cache = createAcceptedWorldCache();

function newGame(seed = "0") {
  return createNewGame("tight-v1", seed, { cache });
}

function queue(runtime: ReturnType<typeof newGame>, action: IntentionalAction) {
  return applyPlayerCommand(runtime, { type: "queue", action });
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

function requireAccepted(seed = "0") {
  const world = getAcceptedWorld("tight-v1", seed, { cache });
  expect(world.ok).toBe(true);
  if (!world.ok) {
    throw new Error(world.message);
  }
  return world;
}

function extraStartingFixture(seed = "0") {
  const world = requireAccepted(seed);
  const proof = proofRequiredFixtures(world.topology, world.witness);
  const onStart = (plane: PlanePair) => planeKey(plane) === planeKey(STARTING_PLANE);
  return (
    world.topology.progressionSources.find((row) => !proof.sourceIds.has(row.id) && onStart(row.plane)) ??
    world.topology.shopInstances.find((row) => !proof.shopIds.has(row.id) && onStart(row.plane)) ??
    world.topology.guardianInstances.find((row) => !proof.guardianIds.has(row.id) && onStart(row.plane)) ??
    world.topology.npcInstances.find((row) => !proof.npcIds.has(row.id) && onStart(row.plane)) ??
    world.topology.questInstances.find((row) => !proof.questIds.has(row.id) && onStart(row.plane))
  );
}

describe("runtime tick engine", () => {
  it("starts New Game on (0,1) with canonical player state", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    expect(runtime.save.plane).toEqual({ a: 0, b: 1 });
    expect(runtime.save.tick).toBe(0);
    expect(player.hp).toBe(18);
    expect(runtime.save.player.attributes.spd).toBe(4);
    expect(runtime.save.player.equipment.weapon).toBe("sword");
    expect(runtime.save.discoveredDimensions).toEqual([0, 1]);
  });

  it("moves a New Game player for multiple ticks with a stable final-state hash", () => {
    const first = newGame();
    applyPlayerCommand(first, { type: "setHeldDirection", direction: "east" });
    for (let i = 0; i < 5; i += 1) {
      const result = advanceTick(first);
      expect(result.advanced).toBe(true);
    }
    expect(first.save.tick).toBe(5);
    const firstHash = hashSaveState(first.save);

    const second = newGame();
    applyPlayerCommand(second, { type: "setHeldDirection", direction: "east" });
    for (let i = 0; i < 5; i += 1) {
      advanceTick(second);
    }
    expect(hashSaveState(second.save)).toBe(firstHash);
    expect(playerActor(second).x).toBe(playerActor(first).x);
    expect(playerActor(second).y).toBe(playerActor(first).y);
  });

  it("holds at most two explicit queued actions", () => {
    const runtime = newGame();
    expect(queue(runtime, { type: "wait" }).ok).toBe(true);
    expect(queue(runtime, { type: "wait" }).ok).toBe(true);
    const third = queue(runtime, { type: "wait" });
    expect(third.ok).toBe(false);
    if (third.ok) {
      throw new Error("expected queue rejection");
    }
    expect(third.code).toBe("rejected");
    expect(runtime.save.actionQueue).toHaveLength(2);
    expect(runtime.save.tick).toBe(0);
  });

  it("consumes an accepted blocked move without changing position", () => {
    const runtime = newGame();
    let last = { x: playerActor(runtime).x, y: playerActor(runtime).y };
    let failed = false;
    for (let i = 0; i < 20; i += 1) {
      expect(queue(runtime, { type: "move", direction: "north" }).ok).toBe(true);
      const result = advanceTick(runtime);
      const now = playerActor(runtime);
      if (result.events.some((event) => event.type === "action_failed" && event.actorId === "player")) {
        expect(now.x).toBe(last.x);
        expect(now.y).toBe(last.y);
        failed = true;
        break;
      }
      last = { x: now.x, y: now.y };
    }
    expect(failed).toBe(true);
  });

  it("does not consume a UI-rejected illegal command", () => {
    const runtime = newGame();
    const rejected = applyPlayerCommand(runtime, {
      type: "queue",
      action: { type: "move", direction: "northeast" as unknown as "north" },
    });
    expect(rejected.ok).toBe(false);
    expect(runtime.save.actionQueue).toHaveLength(0);
    expect(runtime.save.tick).toBe(0);
    const before = { x: playerActor(runtime).x, y: playerActor(runtime).y };
    advanceTick(runtime);
    expect(playerActor(runtime).x).toBe(before.x);
    expect(playerActor(runtime).y).toBe(before.y);
    expect(runtime.save.tick).toBe(1);
  });

  it("prevents semantic ticks while a modal is open", () => {
    const runtime = newGame();
    expect(queue(runtime, { type: "move", direction: "east" }).ok).toBe(true);
    applyPlayerCommand(runtime, { type: "openModal", modal: "inventory" });
    const start = { x: playerActor(runtime).x, y: playerActor(runtime).y, tick: runtime.save.tick };
    const result = advanceTick(runtime);
    expect(result.advanced).toBe(false);
    expect(result.reason).toBe("paused");
    expect(runtime.save.tick).toBe(start.tick);
    expect(playerActor(runtime).x).toBe(start.x);
    expect(runtime.save.actionQueue).toHaveLength(1);
    applyPlayerCommand(runtime, { type: "closeModal" });
    const resumed = advanceTick(runtime);
    expect(resumed.advanced).toBe(true);
    expect(runtime.save.tick).toBe(start.tick + 1);
  });

  it("resolves at most one intentional action per actor per tick", () => {
    const runtime = newGame();
    expect(queue(runtime, { type: "move", direction: "east" }).ok).toBe(true);
    expect(queue(runtime, { type: "move", direction: "east" }).ok).toBe(true);
    expect(runtime.save.actionQueue).toHaveLength(2);
    const first = advanceTick(runtime);
    expect(runtime.save.actionQueue).toHaveLength(1);
    expect(first.events.filter((event) => event.actorId === "player" && (event.type === "actor_moved" || event.type === "action_failed"))).toHaveLength(1);
    const second = advanceTick(runtime);
    expect(runtime.save.actionQueue).toHaveLength(0);
    expect(second.events.filter((event) => event.actorId === "player" && (event.type === "actor_moved" || event.type === "action_failed"))).toHaveLength(1);
  });

  it("dispatches a basic adjacent safe-anchor interaction", () => {
    const runtime = newGame();
    playerActor(runtime).hp = 10;
    const result = queue(runtime, { type: "interact", targetId: "safe_anchor" });
    expect(result.ok).toBe(true);
    const tick = advanceTick(runtime);
    expect(tick.events.some((event) => event.type === "interacted" && event.targetId === "safe_anchor")).toBe(true);
    expect(playerActor(runtime).hp).toBe(18);
    expect(runtime.save.player.safeAnchor.plane).toEqual({ a: 0, b: 1 });
    expect("hp" in runtime.save.player).toBe(false);
    expect("maxHp" in runtime.save.player).toBe(false);
  });

  it("keeps a single authoritative player HP owner under healing and JSON round-trip", () => {
    const runtime = newGame();
    playerActor(runtime).hp = 7;
    expect(playerActor(runtime).hp).toBe(7);
    expect("hp" in runtime.save.player).toBe(false);
    queue(runtime, { type: "interact", targetId: "safe_anchor" });
    advanceTick(runtime);
    expect(playerActor(runtime).hp).toBe(playerActor(runtime).maxHp);
    const restored = JSON.parse(JSON.stringify(runtime.save)) as typeof runtime.save;
    expect(hashSaveState(restored)).toBe(hashSaveState(runtime.save));
    const restoredHp = restored.actors.find((row) => row.id === "player")?.hp;
    expect(restoredHp).toBe(playerActor(runtime).hp);
  });

  it("orders initiative ties from actor identity and current tick", () => {
    const actors: ActorState[] = [
      {
        id: "actor.b",
        definitionId: "npc",
        kind: "npc",
        plane: { a: 0, b: 1 },
        x: 1,
        y: 1,
        hp: 1,
        maxHp: 1,
        spd: 4,
        initiativeModifier: 0,
        blocking: true,
        statuses: [],
        cooldowns: [],
        aiState: "idle",
        ambushReleased: false,
        lastAffectedTick: -1,
        guardX: 1,
        guardY: 1,
        vx: 0,
        vy: 0,
        aiPhaseIndex: 0,
      },
      {
        id: "actor.a",
        definitionId: "npc",
        kind: "npc",
        plane: { a: 0, b: 1 },
        x: 2,
        y: 1,
        hp: 1,
        maxHp: 1,
        spd: 4,
        initiativeModifier: 0,
        blocking: true,
        statuses: [],
        cooldowns: [],
        aiState: "idle",
        ambushReleased: false,
        lastAffectedTick: -1,
        guardX: 2,
        guardY: 1,
        vx: 0,
        vy: 0,
        aiPhaseIndex: 0,
      },
    ];
    const first = initiativeOrder(actors, "0", 0).map((row) => row.actorId);
    const again = initiativeOrder(actors, "0", 0).map((row) => row.actorId);
    expect(again).toEqual(first);
    expect(new Set(first)).toEqual(new Set(["actor.a", "actor.b"]));
    const later = initiativeOrder(actors, "0", 1).map((row) => row.actorId);
    expect(later).toHaveLength(2);
    const higher = {
      ...actors[0]!,
      id: "actor.fast",
      spd: 9,
    };
    const ordered = initiativeOrder([higher, actors[1]!], "0", 0);
    expect(ordered[0]?.actorId).toBe("actor.fast");
  });

  it("round-trips authoritative save state through JSON", () => {
    const runtime = newGame();
    applyPlayerCommand(runtime, { type: "setHeldDirection", direction: "south" });
    advanceTick(runtime);
    const restored = JSON.parse(JSON.stringify(runtime.save));
    expect(hashSaveState(restored)).toBe(hashSaveState(runtime.save));
  });

  it("starts New Game when a non-witness starting-plane fixture is unrealizable", () => {
    const seed = "0";
    const baseline = requireAccepted(seed);
    const extra = extraStartingFixture(seed);
    expect(extra).toBeDefined();
    const generatePlane = (worldSeed: string, topology: (typeof baseline)["topology"], plane: typeof STARTING_PLANE) => {
      const present =
        topology.progressionSources.some((row) => row.id === extra!.id) ||
        topology.shopInstances.some((row) => row.id === extra!.id) ||
        topology.guardianInstances.some((row) => row.id === extra!.id) ||
        topology.npcInstances.some((row) => row.id === extra!.id) ||
        topology.questInstances.some((row) => row.id === extra!.id) ||
        topology.transitions.some((row) => row.id === extra!.id);
      if (present) {
        return failPlane(plane);
      }
      return generatePlaneBase(worldSeed, topology, plane);
    };
    const first = createNewGame("tight-v1", seed, { cache, generatePlane });
    expect(first.save.topologyHash).toBe(baseline.topologyHash);
    expect(first.omittedFixtureIds).toContain(extra!.id);
    expect(first.topology.topologyAttempt).toBe(baseline.acceptedAttempt);
    expect(first.topology.progressionSources.some((row) => row.id === extra!.id) || first.topology.npcInstances.some((row) => row.id === extra!.id) || first.topology.guardianInstances.some((row) => row.id === extra!.id) || first.topology.shopInstances.some((row) => row.id === extra!.id) || first.topology.questInstances.some((row) => row.id === extra!.id)).toBe(true);
    const second = createNewGame("tight-v1", seed, { cache, generatePlane });
    expect(second.currentPlaneBase.planeHash).toBe(first.currentPlaneBase.planeHash);
    expect(second.omittedFixtureIds).toEqual(first.omittedFixtureIds);
    expect(second.save.topologyHash).toBe(first.save.topologyHash);
  });

  it("does not downgrade a proof-required starting-plane failure or change the accepted world", () => {
    const seed = "0";
    const baseline = requireAccepted(seed);
    const proof = proofRequiredFixtures(baseline.topology, baseline.witness);
    const required =
      baseline.topology.progressionSources.find((row) => proof.sourceIds.has(row.id) && planeKey(row.plane) === planeKey(STARTING_PLANE)) ??
      baseline.topology.transitions.find(
        (row) => proof.transitionIds.has(row.id) && (planeKey(row.sourcePlane) === planeKey(STARTING_PLANE) || planeKey(row.destinationPlane) === planeKey(STARTING_PLANE)),
      );
    expect(required).toBeDefined();
    expect(() =>
      createNewGame("tight-v1", seed, {
        cache,
        materializePlane: (worldSeed, topology, plane) => {
          const present =
            topology.progressionSources.some((row) => row.id === required!.id) || topology.transitions.some((row) => row.id === required!.id);
          if (present) {
            return failPlane(plane);
          }
          return generatePlaneBase(worldSeed, topology, plane);
        },
      }),
    ).toThrow(/starting plane unrealizable/);
    const again = requireAccepted(seed);
    expect(again.acceptedAttempt).toBe(baseline.acceptedAttempt);
    expect(again.topologyHash).toBe(baseline.topologyHash);
  });
});
