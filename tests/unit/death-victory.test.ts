import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyAtomicEffect,
  applyPlayerCommand,
  applyStatus,
  cellIsVisible,
  CONTENT_REGISTRY,
  createAcceptedWorldCache,
  createMonsterActor,
  createNewGame,
  effectiveVisibilityRadius,
  ensurePlaneLoaded,
  OLYMPUS_PLANE,
  playerActor,
  resolveDeaths,
  STARTING_PLANE,
  switchCurrentPlane,
  tryAddItem,
} from "../../src/core";
import { GameController } from "../../src/app/game-controller";
import { MemoryPersistence } from "../../src/persistence";
import { PresentationFacade, ProceduralVisualProvider, SilentAudioProvider } from "../../src/presentation";
import { planesEqual } from "../../src/core/model/plane";

const cache = createAcceptedWorldCache();

function newGame(seed = "0") {
  return createNewGame("tight-v1", seed, { cache });
}

function silentController(runtime: ReturnType<typeof newGame>, persistence = new MemoryPersistence()) {
  return new GameController({
    persistence,
    runtime,
    presentation: new PresentationFacade(new ProceduralVisualProvider(), new SilentAudioProvider()),
  });
}

describe("player death", () => {
  it("preserves persistent history and applies canonical transient resets", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    const anchor = runtime.save.player.safeAnchor;
    runtime.save.flags.push("met_mara");
    runtime.save.player.currency = 11;
    runtime.save.player.unspentAp = 2;
    expect(tryAddItem(runtime.save, "ore", 1)).toBe(true);
    runtime.save.quests.push({ instanceId: "q.test", questId: "q_first_crack", state: "active" });
    runtime.save.actionQueue.push({ type: "move", direction: "east" });
    runtime.save.heldDirection = "south";
    player.vx = 2;
    player.vy = -1;
    player.pendingExtraActions = 1;
    player.revealBonusRadius = 2;
    player.revealRemainingTicks = 6;
    applyStatus(player, "poisoned", null, []);
    applyStatus(player, "hasted", null, []);
    runtime.save.pursuits.push({
      actorId: "wolf.test",
      sourcePlane: { ...runtime.save.plane },
      transitionId: "t.test",
      destinationPlane: { a: 0, b: 2 },
      remainingDelay: 4,
      pursuitMode: "follow_same_transition",
      arrivalRule: "exact",
      arrivalX: 1,
      arrivalY: 1,
    });
    player.hp = 0;
    const result = advanceTick(runtime);
    expect(result.events.some((event) => event.type === "player_died")).toBe(true);
    expect(result.events.some((event) => event.type === "player_respawned")).toBe(true);
    expect(result.events.some((event) => event.type === "pursuit_cancelled" && event.actorId === "wolf.test")).toBe(true);
    expect(player.hp).toBe(player.maxHp);
    expect(player.x).toBe(anchor.x);
    expect(player.y).toBe(anchor.y);
    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
    expect(player.pendingExtraActions).toBe(0);
    expect(player.revealRemainingTicks).toBe(0);
    expect(runtime.save.actionQueue).toEqual([]);
    expect(runtime.save.heldDirection).toBeNull();
    expect(runtime.save.pursuits).toEqual([]);
    expect(player.statuses.some((row) => row.id === "poisoned")).toBe(false);
    expect(player.statuses.some((row) => row.id === "hasted")).toBe(true);
    expect(runtime.save.flags).toContain("met_mara");
    expect(runtime.save.player.currency).toBe(11);
    expect(runtime.save.player.unspentAp).toBe(2);
    expect(runtime.save.player.inventory.some((row) => row.itemId === "ore")).toBe(true);
    expect(runtime.save.quests.some((row) => row.questId === "q_first_crack" && row.state === "active")).toBe(true);
  });

  it("respawns on another plane at the activated safe anchor", () => {
    const runtime = newGame();
    const neighbor = runtime.topology.transitions.find((row) => planesEqual(row.sourcePlane, STARTING_PLANE));
    expect(neighbor).toBeDefined();
    const dest = neighbor!.destinationPlane;
    const destPlane = ensurePlaneLoaded(runtime, dest);
    expect(destPlane).not.toBeNull();
    const destAnchor =
      destPlane!.namedPoints.find((point) => point.id === "safe_anchor") ??
      destPlane!.namedPoints.find((point) => point.kind === "playerEntry") ??
      destPlane!.namedPoints[0];
    expect(destAnchor).toBeDefined();
    runtime.save.player.safeAnchor = { plane: { ...dest }, x: destAnchor!.x, y: destAnchor!.y };
    runtime.save.discoveredPlanes.push({ ...dest });
    const player = playerActor(runtime);
    player.hp = 0;
    advanceTick(runtime);
    expect(player.plane).toEqual(dest);
    expect(player.x).toBe(destAnchor!.x);
    expect(player.y).toBe(destAnchor!.y);
    expect(runtime.save.plane).toEqual(dest);
    expect(runtime.currentPlaneBase.plane).toEqual(dest);
  });
});

describe("olympus victory", () => {
  it("marks victory exactly once when the final boss dies on (14,15)", () => {
    const runtime = newGame();
    const plane = switchCurrentPlane(runtime, OLYMPUS_PLANE);
    expect(plane).not.toBeNull();
    const player = playerActor(runtime);
    player.plane = { ...OLYMPUS_PLANE };
    const entry = plane!.namedPoints.find((point) => point.kind === "playerEntry") ?? plane!.namedPoints[0];
    if (entry) {
      player.x = entry.x;
      player.y = entry.y;
    }
    const boss = runtime.save.actors.find((actor) => actor.id === CONTENT_REGISTRY.victory.actorId);
    expect(boss).toBeDefined();
    expect(boss!.definitionId).toBe(CONTENT_REGISTRY.victory.bossId);
    boss!.hp = 0;
    const first = advanceTick(runtime);
    expect(first.events.some((event) => event.type === "monster_died" && event.actorId === CONTENT_REGISTRY.victory.actorId)).toBe(true);
    expect(first.events.filter((event) => event.type === "victory")).toHaveLength(1);
    expect(runtime.save.flags).toContain("victory");
    expect(runtime.save.flags).toContain("final_boss_dead");
    expect(runtime.save.flags).toContain(`defeated:${CONTENT_REGISTRY.victory.actorId}`);
    expect(runtime.save.modal).toBe("victory");
    expect(runtime.save.actors.some((actor) => actor.id === CONTENT_REGISTRY.victory.actorId)).toBe(false);
    expect(advanceTick(runtime).advanced).toBe(false);

    expect(applyPlayerCommand(runtime, { type: "openModal", modal: "inventory" }).ok).toBe(false);
    expect(applyPlayerCommand(runtime, { type: "closeModal" }).ok).toBe(true);
    expect(runtime.save.modal).toBeNull();
    expect(runtime.save.flags).toContain("victory");
    expect(runtime.save.actors.some((actor) => actor.id === CONTENT_REGISTRY.victory.actorId)).toBe(false);

    const ghost = createMonsterActor(CONTENT_REGISTRY.victory.actorId, CONTENT_REGISTRY.victory.bossId, OLYMPUS_PLANE, boss!.x, boss!.y);
    ghost.hp = 0;
    runtime.save.actors.push(ghost);
    const second = advanceTick(runtime);
    expect(second.events.some((event) => event.type === "victory")).toBe(false);
    expect(runtime.save.modal).toBeNull();
    expect(runtime.save.flags.filter((flag) => flag === "victory")).toHaveLength(1);
  });

  it("Continue leaves the world intact and New Game replaces the save", async () => {
    const runtime = newGame();
    runtime.save.flags.push("met_mara", "victory");
    runtime.save.player.currency = 4;
    runtime.save.modal = "victory";
    const persistence = new MemoryPersistence();
    const controller = silentController(runtime, persistence);
    expect(controller.command({ type: "newGame" }).ok).toBe(true);
    expect(controller.runtime.save.modal).toBe("confirm-new-game");
    expect(controller.runtime.save.flags).toContain("met_mara");
    expect(controller.command({ type: "closeModal" }).ok).toBe(true);
    expect(controller.runtime.save.modal).toBe("victory");
    expect(controller.command({ type: "newGame" }).ok).toBe(true);
    expect(controller.command({ type: "newGame" }).ok).toBe(true);
    expect(controller.runtime.save.flags).not.toContain("victory");
    expect(controller.runtime.save.flags).not.toContain("met_mara");
    expect(controller.runtime.save.player.currency).toBe(0);
    expect(controller.runtime.save.tick).toBe(0);
    expect(controller.runtime.save.worldSeed).toBe("0");
    await controller.persist();
    expect(persistence.save?.saveState.flags).toEqual([]);
  });
});

describe("remaining effect primitives", () => {
  it("clears Space velocity, grants one extra action, and reveals tiles for 10 ticks", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.vx = 3;
    player.vy = -2;
    const events: { type: string }[] = [];
    applyAtomicEffect(runtime.save, runtime.currentPlaneBase, CONTENT_REGISTRY.byId.effect.get("clear_velocity")!, player, player, events);
    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
    expect(events.some((event) => event.type === "velocity_cleared")).toBe(true);
    expect(events.some((event) => event.type === "effect_deferred")).toBe(false);

    const start = { x: player.x, y: player.y };
    applyAtomicEffect(runtime.save, runtime.currentPlaneBase, CONTENT_REGISTRY.byId.effect.get("extra_action_once")!, player, player, events);
    expect(player.pendingExtraActions).toBe(1);
    expect(applyPlayerCommand(runtime, { type: "queue", action: { type: "wait" } }).ok).toBe(true);
    expect(applyPlayerCommand(runtime, { type: "queue", action: { type: "wait" } }).ok).toBe(true);
    const extra = advanceTick(runtime);
    expect(extra.events.filter((event) => event.type === "action_waited" && event.actorId === "player")).toHaveLength(2);
    expect(player.pendingExtraActions).toBe(0);
    expect(player.x).toBe(start.x);
    expect(player.y).toBe(start.y);

    runtime.save.family = "void";
    const far = { x: Math.min(15, player.x + 4), y: player.y };
    const terrain = runtime.currentPlaneBase.terrain.map((row) => [...row]);
    const features = runtime.currentPlaneBase.features.map((row) => [...row]);
    const lo = Math.min(player.x, far.x);
    const hi = Math.max(player.x, far.x);
    for (let x = lo; x <= hi; x += 1) {
      terrain[player.y]![x] = "grass";
      features[player.y]![x] = null;
    }
    runtime.currentPlaneBase = { ...runtime.currentPlaneBase, terrain, features };
    expect(effectiveVisibilityRadius(runtime)).toBe(3);
    expect(cellIsVisible(runtime, far)).toBe(false);
    applyAtomicEffect(runtime.save, runtime.currentPlaneBase, CONTENT_REGISTRY.byId.effect.get("reveal_radius_2_10")!, player, player, events);
    expect(player.revealBonusRadius).toBe(2);
    expect(player.revealRemainingTicks).toBe(10);
    expect(effectiveVisibilityRadius(runtime)).toBe(5);
    expect(cellIsVisible(runtime, far)).toBe(true);
    applyPlayerCommand(runtime, { type: "queue", action: { type: "wait" } });
    advanceTick(runtime);
    expect(player.revealRemainingTicks).toBe(9);
  });
});

describe("mechanical completeness", () => {
  it("keeps inspectable death and victory catalogue rows", () => {
    expect(CONTENT_REGISTRY.deathRules.id).toBe("player_death_v1");
    expect(CONTENT_REGISTRY.deathRules.respawnAt).toBe("safeAnchor");
    expect(CONTENT_REGISTRY.victory.plane).toEqual({ a: 14, b: 15 });
    expect(CONTENT_REGISTRY.victory.bossId).toBe("olympian_final");
    expect(CONTENT_REGISTRY.worldFlags).toContain("victory");
  });

  it("implements every atomic effect kind without deferral", () => {
    const kinds = new Set(CONTENT_REGISTRY.atomicEffects.map((effect) => effect.kind));
    expect([...kinds].sort()).toEqual([
      "applyStatus",
      "clearVelocity",
      "damage",
      "extraActionOnce",
      "forcedMove",
      "heal",
      "removeStatus",
      "revealTiles",
      "teleportWithinPlane",
    ]);
    const runtime = newGame();
    resolveDeaths(runtime, []);
    const player = playerActor(runtime);
    for (const effect of CONTENT_REGISTRY.atomicEffects) {
      if (effect.kind === "forcedMove" || effect.kind === "teleportWithinPlane") {
        continue;
      }
      const events: { type: string }[] = [];
      applyAtomicEffect(runtime.save, runtime.currentPlaneBase, effect, player, player, events);
      expect(events.some((event) => event.type === "effect_deferred")).toBe(false);
    }
  });
});
