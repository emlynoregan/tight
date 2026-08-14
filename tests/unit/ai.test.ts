import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyPlayerCommand,
  applyStatus,
  createAcceptedWorldCache,
  createMonsterActor,
  createNewGame,
  detectsPlayer,
  hashSaveState,
  playerActor,
  progressBossPhases,
  selectMonsterAction,
  shortestPathFirstAction,
  shortestPathFirstStep,
} from "../../src/core";
import { emptyGrid } from "../../src/core/generation/grid";
import type { PlaneBase } from "../../src/core/generation/plane-types";
import type { FamilyId } from "../../src/core/model/ids";

const cache = createAcceptedWorldCache();

function newGame(seed = "0") {
  return createNewGame("tight-v1", seed, { cache });
}

function openPlane(family: FamilyId = "aboveground", wraps = false): PlaneBase {
  return {
    generatorVersion: "tight-v1",
    worldSeed: "0",
    plane: { a: 0, b: 1 },
    family,
    wraps,
    terrain: emptyGrid("grass"),
    features: emptyGrid<string | null>(null),
    namedPoints: [],
    spawnRegions: [],
    transitionFixtures: [],
    repairs: [],
    planeHash: "test",
  };
}

function withFeature(plane: PlaneBase, x: number, y: number, feature: string): PlaneBase {
  const features = plane.features.map((row) => [...row]);
  features[y]![x] = feature;
  return { ...plane, features };
}

function isolate(
  speciesId: string,
  playerPos: { x: number; y: number },
  monsterPos: { x: number; y: number },
  plane: PlaneBase = openPlane(),
) {
  const runtime = newGame();
  const player = playerActor(runtime);
  player.x = playerPos.x;
  player.y = playerPos.y;
  runtime.currentPlaneBase = plane;
  runtime.save.family = plane.family;
  runtime.save.plane = plane.plane;
  const monster = createMonsterActor("m.1", speciesId, plane.plane, monsterPos.x, monsterPos.y);
  runtime.save.actors = [player, monster];
  return { runtime, player, monster };
}

function tickWait(runtime: ReturnType<typeof newGame>) {
  return advanceTick(runtime);
}

function pathStep(setup: ReturnType<typeof isolate>, goals: { x: number; y: number }[]) {
  return shortestPathFirstStep(
    setup.runtime.currentPlaneBase,
    setup.runtime.save,
    [setup.monster],
    setup.monster,
    goals,
  );
}

function pathAction(setup: ReturnType<typeof isolate>, goals: { x: number; y: number }[]) {
  return shortestPathFirstAction(
    setup.runtime.currentPlaneBase,
    setup.runtime.save,
    [setup.monster],
    setup.monster,
    goals,
  );
}

describe("pathfinding ties", () => {
  it("breaks equal-length paths with up, right, down, left neighbour order", () => {
    const setup = isolate("wolf", { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(pathStep(setup, [{ x: 6, y: 4 }])).toBe("north");
  });

  it("prefers the lower (y,x) goal among equal-cost engagement cells", () => {
    const setup = isolate("wolf", { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(
      pathStep(setup, [
        { x: 7, y: 8 },
        { x: 8, y: 7 },
      ]),
    ).toBe("east");
  });

  it("wraps neighbours before legality on wrapping planes", () => {
    const plane = openPlane("space", true);
    const setup = isolate("vacuum_crawler", { x: 8, y: 8 }, { x: 0, y: 8 }, plane);
    expect(pathStep(setup, [{ x: 15, y: 8 }])).toBe("west");
  });

  it("uses a cheaper open corridor instead of a geometrically shorter closed door", () => {
    const plane = withFeature(openPlane(), 6, 5, "door");
    const setup = isolate("bandit", { x: 0, y: 0 }, { x: 5, y: 5 }, plane);
    expect(pathAction(setup, [{ x: 6, y: 6 }])).toEqual({ type: "move", direction: "south" });
  });

  it("opens a closed door before traversing it, then walks through on a later tick", () => {
    let plane = withFeature(openPlane(), 6, 5, "door");
    plane = withFeature(plane, 6, 4, "tree");
    plane = withFeature(plane, 6, 6, "tree");
    const setup = isolate("bandit", { x: 7, y: 5 }, { x: 5, y: 5 }, plane);
    setup.runtime.save.tick = 1;
    setup.monster.lastAffectedTick = 0;
    setup.monster.aiState = "chasing";
    const first = tickWait(setup.runtime);
    expect(first.events.some((event) => event.type === "door_toggled" && event.detail === "open" && event.actorId === "m.1")).toBe(
      true,
    );
    expect(setup.monster.x).toBe(5);
    expect(setup.monster.y).toBe(5);
    setup.monster.lastAffectedTick = setup.runtime.save.tick - 1;
    setup.monster.aiState = "chasing";
    tickWait(setup.runtime);
    expect(setup.monster.x).toBe(6);
    expect(setup.monster.y).toBe(5);
  });

  it("treats a closed door as blocked for non-door-users", () => {
    const plane = withFeature(openPlane(), 6, 5, "door");
    const wolf = isolate("wolf", { x: 8, y: 8 }, { x: 5, y: 5 }, plane);
    expect(pathAction(wolf, [{ x: 7, y: 5 }])?.type).not.toBe("interact");
    expect(pathStep(wolf, [{ x: 7, y: 5 }])).toBe("north");
  });
});

describe("detection", () => {
  it("requires radius and LOS unless the species ignores LOS", () => {
    const clear = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 4 });
    expect(detectsPlayer(clear.runtime.currentPlaneBase, clear.runtime.save, clear.monster, clear.player)).toBe(true);
    const blockedPlane = withFeature(openPlane(), 8, 6, "tree");
    const blocked = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 4 }, blockedPlane);
    expect(detectsPlayer(blocked.runtime.currentPlaneBase, blocked.runtime.save, blocked.monster, blocked.player)).toBe(
      false,
    );
    const hunter = isolate("blind_hunter", { x: 8, y: 8 }, { x: 8, y: 4 }, blockedPlane);
    expect(detectsPlayer(hunter.runtime.currentPlaneBase, hunter.runtime.save, hunter.monster, hunter.player)).toBe(true);
  });

  it("does not detect a hidden player unless orthogonally adjacent", () => {
    const far = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 4 });
    applyStatus(far.player, "hidden", null, []);
    expect(detectsPlayer(far.runtime.currentPlaneBase, far.runtime.save, far.monster, far.player)).toBe(false);
    const near = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 7 });
    applyStatus(near.player, "hidden", null, []);
    expect(detectsPlayer(near.runtime.currentPlaneBase, near.runtime.save, near.monster, near.player)).toBe(true);
  });
});

describe("canonical AI profiles", () => {
  it("makes a brute take a shortest-path step toward engagement, then attack when adjacent", () => {
    const approaching = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 5 });
    const moved = tickWait(approaching.runtime);
    expect(moved.events.some((event) => event.type === "actor_moved" && event.actorId === "m.1")).toBe(true);
    expect(approaching.monster.y).toBe(6);
    const melee = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 7 });
    const bite = tickWait(melee.runtime);
    expect(bite.events.some((event) => event.attackId === "bite" && event.actorId === "m.1")).toBe(true);
  });

  it("makes a skirmisher retreat from adjacency into the 2–4 band", () => {
    const setup = isolate("cutpurse", { x: 8, y: 8 }, { x: 8, y: 7 });
    tickWait(setup.runtime);
    const dist = Math.abs(setup.monster.x - setup.player.x) + Math.abs(setup.monster.y - setup.player.y);
    expect(dist).toBeGreaterThanOrEqual(2);
    expect(setup.monster.aiState === "alert" || setup.monster.aiState === "chasing").toBe(true);
  });

  it("makes a sniper use a legal ranged attack instead of closing", () => {
    const setup = isolate("bandit_archer", { x: 8, y: 8 }, { x: 8, y: 4 });
    const result = tickWait(setup.runtime);
    expect(result.events.some((event) => event.attackId === "bow_shot" && event.actorId === "m.1")).toBe(true);
    expect(setup.monster.x).toBe(8);
    expect(setup.monster.y).toBe(4);
  });

  it("keeps an ambusher idle outside trigger radius, then uses in-plane AI inside it", () => {
    const waiting = isolate("cave_crawler", { x: 8, y: 8 }, { x: 8, y: 4 });
    tickWait(waiting.runtime);
    expect(waiting.monster.x).toBe(8);
    expect(waiting.monster.y).toBe(4);
    expect(waiting.monster.ambushReleased).toBe(false);
    const sprung = isolate("cave_crawler", { x: 8, y: 8 }, { x: 8, y: 5 });
    tickWait(sprung.runtime);
    expect(sprung.monster.ambushReleased).toBe(true);
    expect(sprung.monster.y).toBe(6);
  });

  it("prefers a controller's first legal control ability over a direct attack", () => {
    const setup = isolate("cultist", { x: 8, y: 8 }, { x: 8, y: 5 });
    const result = tickWait(setup.runtime);
    expect(result.events.some((event) => event.actorId === "m.1" && event.attackId === "confuse")).toBe(true);
  });

  it("keeps a guardian inside its radius and returns to origin when the player leaves", () => {
    const chasing = isolate("house_guard", { x: 8, y: 10 }, { x: 8, y: 8 });
    tickWait(chasing.runtime);
    const distFromOrigin =
      Math.abs(chasing.monster.x - chasing.monster.guardX) + Math.abs(chasing.monster.y - chasing.monster.guardY);
    expect(distFromOrigin).toBeLessThanOrEqual(4);
    const returning = isolate("house_guard", { x: 8, y: 14 }, { x: 8, y: 10 });
    returning.monster.guardX = 8;
    returning.monster.guardY = 8;
    tickWait(returning.runtime);
    expect(returning.monster.y).toBe(9);
  });

  it("lets a dimensional hunter use its referenced in-plane profile", () => {
    const setup = isolate("rune_hound", { x: 8, y: 8 }, { x: 8, y: 7 });
    const result = tickWait(setup.runtime);
    expect(result.events.some((event) => event.attackId === "bite" && event.actorId === "m.1")).toBe(true);
  });

  it("uses semantic randomness for wanderer idle movement", () => {
    const first = isolate("rat", { x: 1, y: 1 }, { x: 10, y: 10 });
    const second = isolate("rat", { x: 1, y: 1 }, { x: 10, y: 10 });
    let wandered = false;
    for (let i = 0; i < 24; i += 1) {
      const events = tickWait(first.runtime).events;
      tickWait(second.runtime);
      wandered ||= events.some((event) => event.type === "actor_moved" && event.actorId === "m.1");
    }
    expect(hashSaveState(first.runtime.save)).toBe(hashSaveState(second.runtime.save));
    expect(wandered).toBe(true);
  });
});

describe("Space thrust and hash stability", () => {
  it("converts Space AI movement into a clamped thrust, then applies velocity", () => {
    const plane = openPlane("space", true);
    const setup = isolate("vacuum_crawler", { x: 8, y: 8 }, { x: 8, y: 5 }, plane);
    const result = tickWait(setup.runtime);
    expect(result.events.some((event) => event.type === "thrusted" && event.actorId === "m.1")).toBe(true);
    expect(setup.monster.vy).toBe(1);
    expect(setup.monster.y).toBe(6);
    expect(setup.monster.x).toBe(8);
  });

  it("keeps a multi-tick chase hash stable across identical runs", () => {
    const play = () => {
      const setup = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 3 });
      applyPlayerCommand(setup.runtime, { type: "setHeldDirection", direction: "east" });
      for (let i = 0; i < 8; i += 1) {
        advanceTick(setup.runtime);
      }
      return hashSaveState(setup.runtime.save);
    };
    expect(play()).toBe(play());
  });

  it("lets scriptedActions override AI", () => {
    const setup = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 5 });
    setup.runtime.scriptedActions.set("m.1", { type: "wait" });
    tickWait(setup.runtime);
    expect(setup.monster.x).toBe(8);
    expect(setup.monster.y).toBe(5);
  });
});

describe("boss phases and confused AI", () => {
  it("applies skipped phase-entry effects once in ascending order before using the highest phase", () => {
    const setup = isolate("golem_warden", { x: 8, y: 8 }, { x: 8, y: 7 });
    setup.monster.maxHp = 100;
    setup.monster.hp = 30;
    const events: { type: string; detail?: string }[] = [];
    const phase = progressBossPhases(
      setup.runtime.save,
      setup.runtime.currentPlaneBase,
      setup.monster,
      [
        { name: "p1", hpAtMostPercent: null, ai: "brute", attackIds: ["hammer_blow"] },
        { name: "p2", hpAtMostPercent: 70, ai: "brute", attackIds: ["hammer_blow"], entryEffectOrBundleId: "apply_hasted" },
        { name: "p3", hpAtMostPercent: 35, ai: "skirmisher", attackIds: ["body_slam"], entryEffectOrBundleId: "apply_confused" },
      ],
      events,
    );
    expect(phase.name).toBe("p3");
    expect(setup.monster.aiPhaseIndex).toBe(2);
    expect(setup.monster.statuses.map((row) => row.id).sort()).toEqual(["confused", "hasted"]);
    progressBossPhases(
      setup.runtime.save,
      setup.runtime.currentPlaneBase,
      setup.monster,
      [
        { name: "p1", hpAtMostPercent: null, ai: "brute", attackIds: ["hammer_blow"] },
        { name: "p2", hpAtMostPercent: 70, ai: "brute", attackIds: ["hammer_blow"], entryEffectOrBundleId: "apply_hasted" },
        { name: "p3", hpAtMostPercent: 35, ai: "skirmisher", attackIds: ["body_slam"], entryEffectOrBundleId: "apply_confused" },
      ],
      events,
    );
    expect(setup.monster.statuses.filter((row) => row.id === "hasted")).toHaveLength(1);
    expect(setup.monster.statuses.filter((row) => row.id === "confused")).toHaveLength(1);
  });

  it("lets a phase-entry stun determine the action selected that tick", () => {
    const setup = isolate("golem_warden", { x: 8, y: 8 }, { x: 8, y: 7 });
    setup.monster.maxHp = 100;
    setup.monster.hp = 40;
    setup.monster.aiState = "chasing";
    const events: { type: string; detail?: string }[] = [];
    progressBossPhases(
      setup.runtime.save,
      setup.runtime.currentPlaneBase,
      setup.monster,
      [
        { name: "p1", hpAtMostPercent: null, ai: "brute", attackIds: ["hammer_blow"] },
        { name: "p2", hpAtMostPercent: 50, ai: "brute", attackIds: ["hammer_blow"], entryEffectOrBundleId: "apply_stunned" },
      ],
      events,
    );
    const action = selectMonsterAction(setup.runtime, setup.monster, events);
    expect(setup.monster.statuses.some((row) => row.id === "stunned")).toBe(true);
    expect(action).toEqual({ type: "wait" });
  });

  it("selects confused actions from the legal wait/move/attack set with runtime.ai keys", () => {
    const setup = isolate("wolf", { x: 8, y: 8 }, { x: 8, y: 7 });
    applyStatus(setup.monster, "confused", null, []);
    setup.monster.aiState = "chasing";
    const first = selectMonsterAction(setup.runtime, setup.monster);
    const again = selectMonsterAction(setup.runtime, setup.monster);
    expect(again).toEqual(first);
    expect(["wait", "move", "attack"]).toContain(first.type);
    if (first.type === "attack") {
      expect(first.attackId).toBe("bite");
    }
    if (first.type === "move") {
      expect(["north", "east", "south", "west"]).toContain(first.direction);
    }
    setup.runtime.save.tick += 1;
    const later = selectMonsterAction(setup.runtime, setup.monster);
    expect(["wait", "move", "attack"]).toContain(later.type);
  });
});
