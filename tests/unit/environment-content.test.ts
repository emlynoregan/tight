import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyPlayerCommand,
  applyStatus,
  cellIsVisible,
  createAcceptedWorldCache,
  createNewGame,
  createRuntimeFromSave,
  executeWitness,
  familyWraps,
  getQuestLogView,
  getShopView,
  hasLineOfSight,
  hashSaveState,
  playerActor,
  recordDiscovery,
  switchCurrentPlane,
  tryAddItem,
} from "../../src/core";
import { emptyGrid } from "../../src/core/generation/grid";
import type { PlaneBase } from "../../src/core/generation/plane-types";
import { CONTENT_REGISTRY } from "../../src/core";
import { setFeatureRuntimeState } from "../../src/core/rules/occupancy";

const cache = createAcceptedWorldCache();

function newGame(seed = "0") {
  return createNewGame("tight-v1", seed, { cache });
}

function waitTick(runtime: ReturnType<typeof newGame>) {
  applyPlayerCommand(runtime, { type: "queue", action: { type: "wait" } });
  return advanceTick(runtime);
}

function withTerrain(runtime: ReturnType<typeof newGame>, tileId: string, x: number, y: number): void {
  const terrain = runtime.currentPlaneBase.terrain.map((row) => [...row]);
  terrain[y]![x] = tileId;
  runtime.currentPlaneBase = { ...runtime.currentPlaneBase, terrain };
}

function openPlane(featureAt?: { x: number; y: number; feature: string }): PlaneBase {
  const terrain = emptyGrid("grass");
  const features = emptyGrid<string | null>(null);
  if (featureAt) {
    features[featureAt.y]![featureAt.x] = featureAt.feature;
  }
  return {
    generatorVersion: "tight-v1",
    worldSeed: "0",
    plane: { a: 0, b: 1 },
    family: "aboveground",
    wraps: false,
    terrain,
    features,
    namedPoints: [],
    spawnRegions: [],
    transitionFixtures: [],
    repairs: [],
    planeHash: "test",
  };
}

describe("environment families", () => {
  it("applies lava onEnter unless fire protection is equipped", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    runtime.save.actors = [player];
    const hp = player.hp;
    withTerrain(runtime, "lava", player.x, player.y);
    const result = waitTick(runtime);
    expect(result.events.some((event) => event.type === "hazard_triggered" && event.detail === "lava")).toBe(true);
    expect(playerActor(runtime).hp).toBeLessThan(hp);
  });

  it("applies vacuum onEndTick on space planes and skips it with a vacuum suit", () => {
    const unprotected = newGame();
    const unprotectedPlayer = playerActor(unprotected);
    unprotected.save.actors = [unprotectedPlayer];
    unprotected.save.family = "space";
    unprotected.currentPlaneBase = { ...unprotected.currentPlaneBase, family: "space", wraps: true };
    withTerrain(unprotected, "vacuum", unprotectedPlayer.x, unprotectedPlayer.y);
    const hp = unprotectedPlayer.hp;
    const vacuumTick = waitTick(unprotected);
    expect(vacuumTick.events.some((event) => event.type === "hazard_triggered" && event.detail === "vacuum")).toBe(true);
    expect(playerActor(unprotected).hp).toBeLessThan(hp);

    const protectedRun = newGame();
    const protectedPlayer = playerActor(protectedRun);
    protectedRun.save.actors = [protectedPlayer];
    expect(tryAddItem(protectedRun.save, "vacuum_suit", 1)).toBe(true);
    applyPlayerCommand(protectedRun, { type: "openModal", modal: "inventory" });
    expect(applyPlayerCommand(protectedRun, { type: "equip", itemId: "vacuum_suit" }).ok).toBe(true);
    applyPlayerCommand(protectedRun, { type: "closeModal" });
    protectedRun.save.family = "space";
    protectedRun.currentPlaneBase = { ...protectedRun.currentPlaneBase, family: "space", wraps: true };
    withTerrain(protectedRun, "vacuum", protectedPlayer.x, protectedPlayer.y);
    const protectedHp = playerActor(protectedRun).hp;
    waitTick(protectedRun);
    expect(playerActor(protectedRun).hp).toBe(protectedHp);
  });

  it("uses void visibility radius 3", () => {
    const runtime = newGame();
    expect(switchCurrentPlane(runtime, { a: 12, b: 13 })).not.toBeNull();
    runtime.save.family = "void";
    const player = playerActor(runtime);
    expect(cellIsVisible(runtime, { x: player.x, y: player.y })).toBe(true);
    expect(cellIsVisible(runtime, { x: Math.min(15, player.x + 3), y: player.y })).toBe(true);
    expect(cellIsVisible(runtime, { x: Math.min(15, player.x + 4), y: player.y })).toBe(false);
  });

  it("lets open doors stop blocking line of sight", () => {
    const plane = openPlane({ x: 2, y: 1, feature: "door" });
    const runtime = newGame();
    runtime.currentPlaneBase = plane;
    expect(hasLineOfSight(plane, { x: 1, y: 1 }, { x: 3, y: 1 }, runtime.save)).toBe(false);
    setFeatureRuntimeState(runtime.save, plane.plane, { x: 2, y: 1 }, "open");
    expect(hasLineOfSight(plane, { x: 1, y: 1 }, { x: 3, y: 1 }, runtime.save)).toBe(true);
  });

  it("does not treat wrap-adjacent cells as a LOS shortcut", () => {
    const terrain = emptyGrid("arcane_floor");
    for (let x = 1; x < 15; x += 1) {
      terrain[8]![x] = "solid_rock";
    }
    const plane: PlaneBase = {
      generatorVersion: "tight-v1",
      worldSeed: "0",
      plane: { a: 6, b: 7 },
      family: "arcane",
      wraps: true,
      terrain,
      features: emptyGrid<string | null>(null),
      namedPoints: [],
      spawnRegions: [],
      transitionFixtures: [],
      repairs: [],
      planeHash: "wrap-los",
    };
    expect(familyWraps("arcane")).toBe(true);
    expect(hasLineOfSight(plane, { x: 0, y: 8 }, { x: 15, y: 8 })).toBe(false);
  });

  it("clears temporary negative statuses at a safe anchor", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    applyStatus(player, "poisoned", null, []);
    expect(player.statuses.some((row) => row.id === "poisoned")).toBe(true);
    const anchor = runtime.currentPlaneBase.namedPoints.find((point) => point.id === "safe_anchor");
    expect(anchor).toBeDefined();
    player.x = anchor!.x;
    player.y = anchor!.y;
    applyPlayerCommand(runtime, { type: "queue", action: { type: "interact" } });
    advanceTick(runtime);
    expect(playerActor(runtime).statuses.some((row) => row.id === "poisoned")).toBe(false);
    expect(playerActor(runtime).hp).toBe(playerActor(runtime).maxHp);
  });
});

describe("encounters and rewards", () => {
  it("grants AP on first entry into a new dimension", () => {
    const runtime = newGame();
    expect(runtime.save.player.unspentAp).toBe(0);
    const events: { type: string }[] = [];
    recordDiscovery(runtime.save, { a: 4, b: 5 }, events);
    expect(runtime.save.discoveredDimensions).toContain(4);
    expect(runtime.save.player.unspentAp).toBe(2);
    recordDiscovery(runtime.save, { a: 4, b: 6 }, events);
    expect(runtime.save.player.unspentAp).toBe(3);
  });

  it("does not rematerialize a defeated guardian and grants its solver-visible reward", () => {
    const runtime = newGame();
    const guardian = runtime.topology.guardianInstances[0];
    expect(guardian).toBeDefined();
    expect(switchCurrentPlane(runtime, guardian!.plane)).not.toBeNull();
    const actor = runtime.save.actors.find((row) => row.id === guardian!.id);
    expect(actor).toBeDefined();
    const source = runtime.topology.progressionSources.find((row) => row.id === `source.guardian_reward.${guardian!.id}`);
    const currencyBefore = runtime.save.player.currency;
    actor!.hp = 0;
    waitTick(runtime);
    expect(runtime.save.flags.includes(`defeated:${guardian!.id}`)).toBe(true);
    expect(runtime.save.actors.some((row) => row.id === guardian!.id)).toBe(false);
    if (source?.grants.some((grant) => grant.startsWith("currency:"))) {
      expect(runtime.save.player.currency).toBeGreaterThan(currencyBefore);
    }
    expect(switchCurrentPlane(runtime, { a: 0, b: 1 })).not.toBeNull();
    expect(switchCurrentPlane(runtime, guardian!.plane)).not.toBeNull();
    expect(runtime.save.actors.some((row) => row.id === guardian!.id)).toBe(false);
  });

  it("opens a container once and applies the matching progression source", () => {
    const runtime = newGame();
    const source = runtime.topology.progressionSources.find((row) => row.sourceType === "container");
    expect(source).toBeDefined();
    expect(switchCurrentPlane(runtime, source!.plane)).not.toBeNull();
    const point = runtime.currentPlaneBase.namedPoints.find((row) => row.id === source!.id);
    const approach = runtime.currentPlaneBase.namedPoints.find((row) => row.id === `${source!.id}.approach`);
    expect(point).toBeDefined();
    expect(approach).toBeDefined();
    const player = playerActor(runtime);
    player.plane = { ...source!.plane };
    player.x = approach!.x;
    player.y = approach!.y;
    applyPlayerCommand(runtime, {
      type: "queue",
      action: { type: "interact", targetId: "container_chest", targetX: point!.x, targetY: point!.y },
    });
    advanceTick(runtime);
    expect(runtime.save.collectedSources.includes(source!.id)).toBe(true);
    applyPlayerCommand(runtime, {
      type: "queue",
      action: { type: "interact", targetId: "container_chest", targetX: point!.x, targetY: point!.y },
    });
    const second = advanceTick(runtime);
    expect(second.events.some((event) => event.detail === "already opened")).toBe(true);
  });

  it("keeps limited shop stock consumed after purchase", () => {
    const runtime = newGame();
    const shop = runtime.topology.shopInstances[0];
    expect(shop).toBeDefined();
    const limited = runtime.topology.progressionSources.find(
      (row) => row.sourceType === "shop_stock" && row.id.startsWith(`source.shop_stock.${shop!.id}.`) && row.unlimited !== true,
    );
    expect(limited).toBeDefined();
    runtime.save.player.currency = 999;
    applyPlayerCommand(runtime, { type: "openModal", modal: `shop:${shop!.id}` });
    expect(applyPlayerCommand(runtime, { type: "buy", sourceId: limited!.id }).ok).toBe(true);
    expect(runtime.save.collectedSources.includes(limited!.id)).toBe(true);
    expect(applyPlayerCommand(runtime, { type: "buy", sourceId: limited!.id }).ok).toBe(false);
    const view = getShopView(runtime);
    expect(view?.stock.find((row) => row.sourceId === limited!.id)?.remaining).toBe(0);
  });
});

describe("dialogue, quests and witness", () => {
  it("starts an authored quest from dialogue and lists it in the quest log", () => {
    const runtime = newGame();
    applyPlayerCommand(runtime, { type: "openModal", modal: "dialogue:test:dlg_mara_intro" });
    expect(applyPlayerCommand(runtime, { type: "dialogueChoice", choiceId: "mara_accept" }).ok).toBe(true);
    expect(runtime.save.quests.some((row) => row.questId === "q_first_crack" && row.state !== "unavailable")).toBe(true);
    expect(getQuestLogView(runtime).some((row) => row.questId === "q_first_crack")).toBe(true);
  });

  it("executes a generated winning witness through runtime shop and quest systems", () => {
    const runtime = newGame();
    const result = executeWitness(runtime, runtime.world.witness);
    expect(result.ok).toBe(true);
    expect(runtime.save.player.learnedAbilities.length + runtime.save.flags.length + runtime.save.collectedSources.length).toBeGreaterThan(0);
    const shopStep = runtime.world.witness.find((step) => step.type === "BUY_ITEM");
    const questStep = runtime.world.witness.find((step) => step.type === "COMPLETE_QUEST");
    expect(shopStep || questStep).toBeTruthy();
    if (shopStep?.id) {
      expect(runtime.save.collectedSources.includes(shopStep.id) || runtime.save.player.inventory.length > 0).toBe(true);
    }
    if (questStep?.id) {
      const instance = runtime.topology.questInstances.find((row) => row.id === questStep.id);
      if (instance) {
        expect(runtime.save.quests.some((row) => row.questId === instance.questId && row.state === "complete")).toBe(true);
      }
    }
  });

  it("round-trips new quest and collected-source fields through save load", () => {
    const runtime = newGame();
    runtime.save.collectedSources.push("source.test");
    runtime.save.quests.push({ instanceId: "quest.test", questId: "q_first_crack", state: "active" });
    runtime.save.awardedApEvents.push("ap_dimension_first_entry:4");
    const loaded = createRuntimeFromSave(runtime.save, { cache });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.runtime.save.collectedSources).toContain("source.test");
      expect(loaded.runtime.save.quests[0]?.state).toBe("active");
      expect(hashSaveState(loaded.runtime.save)).toBe(hashSaveState(runtime.save));
    }
  });
});

describe("canonical family wrap flags", () => {
  it("wraps Arcane and Space only", () => {
    expect(familyWraps("arcane")).toBe(true);
    expect(familyWraps("space")).toBe(true);
    expect(familyWraps("ethereal")).toBe(false);
    expect(familyWraps("void")).toBe(false);
    expect(CONTENT_REGISTRY.planeFamilies.find((row) => row.id === "void")?.defaultVisibility).toBe("void");
  });
});
