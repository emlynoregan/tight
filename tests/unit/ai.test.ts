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
  shortestPathFirstStep,
  type ActorState,
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

describe("pathfinding ties", () => {
  it("breaks equal-length paths with up, right, down, left neighbour order", () => {
    const plane = openPlane();
    const mover: ActorState = isolate("wolf", { x: 0, y: 0 }, { x: 5, y: 5 }).monster;
    const step = shortestPathFirstStep(plane, [mover], mover, [{ x: 6, y: 4 }]);
    expect(step).toBe("north");
  });

  it("prefers the lower (y,x) goal among equal-cost engagement cells", () => {
    const plane = openPlane();
    const mover = isolate("wolf", { x: 0, y: 0 }, { x: 5, y: 5 }).monster;
    const step = shortestPathFirstStep(plane, [mover], mover, [
      { x: 7, y: 8 },
      { x: 8, y: 7 },
    ]);
    expect(step).toBe("east");
  });

  it("wraps neighbours before legality on wrapping planes", () => {
    const plane = openPlane("space", true);
    const mover = isolate("vacuum_crawler", { x: 8, y: 8 }, { x: 0, y: 8 }, plane).monster;
    expect(shortestPathFirstStep(plane, [mover], mover, [{ x: 15, y: 8 }])).toBe("west");
  });

  it("treats doors as blocked for non-door users and walkable for door users", () => {
    const plane = withFeature(openPlane(), 6, 5, "door");
    const wolf = isolate("wolf", { x: 8, y: 8 }, { x: 5, y: 5 }, plane).monster;
    const bandit = isolate("bandit", { x: 8, y: 8 }, { x: 5, y: 5 }, plane).monster;
    expect(shortestPathFirstStep(plane, [wolf], wolf, [{ x: 7, y: 5 }])).toBe("north");
    expect(shortestPathFirstStep(plane, [bandit], bandit, [{ x: 7, y: 5 }])).toBe("east");
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
