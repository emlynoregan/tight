import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyPlayerCommand,
  applyStatus,
  cellIsVisible,
  createAcceptedWorldCache,
  createMonsterActor,
  createNewGame,
  createRuntimeFromSave,
  executeWitness,
  familyWraps,
  forcedMove,
  getQuestLogView,
  getShopView,
  hasLineOfSight,
  hashSaveState,
  playerActor,
  recordDiscovery,
  semantic,
  switchCurrentPlane,
  teleportWithinPlane,
  tryAddItem,
} from "../../src/core";
import { chebyshev, emptyGrid, manhattan } from "../../src/core/generation/grid";
import type { PlaneBase } from "../../src/core/generation/plane-types";
import { CONTENT_REGISTRY } from "../../src/core";
import { cellsForEncounterPattern, encounterEligibleForPlane } from "../../src/core/rules/encounters";
import { relocateActor } from "../../src/core/rules/apply-effects";
import { setFeatureRuntimeState } from "../../src/core/rules/occupancy";
import { startQuest, questState } from "../../src/core/rules/quests";

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
    expect(result.ok, result.message).toBe(true);
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

function placementParts(plane: PlaneBase, subject: string) {
  return [
    semantic.string(plane.generatorVersion),
    semantic.string(plane.worldSeed),
    semantic.i64(0),
    semantic.plane(plane.plane),
    semantic.string("test.place"),
    semantic.string(subject),
  ];
}

function patternPlane(options: {
  family?: PlaneBase["family"];
  plane?: PlaneBase["plane"];
  terrain?: string;
  walls?: { x: number; y: number }[];
  features?: { x: number; y: number; feature: string }[];
  entry?: { x: number; y: number };
  spawn?: boolean;
}): PlaneBase {
  const terrain = emptyGrid(options.terrain ?? "grass");
  const features = emptyGrid<string | null>(null);
  for (const wall of options.walls ?? []) {
    terrain[wall.y]![wall.x] = "solid_rock";
  }
  for (const row of options.features ?? []) {
    features[row.y]![row.x] = row.feature;
  }
  const entry = options.entry ?? { x: 0, y: 0 };
  const planePair = options.plane ?? { a: 0, b: 1 };
  return {
    generatorVersion: "tight-v1",
    worldSeed: "pattern",
    plane: planePair,
    family: options.family ?? "aboveground",
    wraps: false,
    terrain,
    features,
    namedPoints: [{ id: "entry", kind: "playerEntry", x: entry.x, y: entry.y }],
    spawnRegions: options.spawn === false ? [] : [{ tag: "playerEntry", cells: [entry] }],
    transitionFixtures: (options.features ?? [])
      .filter((row) => row.feature === "transition_fixture")
      .map((row, index) => ({ transitionId: `t${index}`, x: row.x, y: row.y })),
    repairs: [],
    planeHash: "pattern",
  };
}

describe("encounter eligibility and placement patterns", () => {
  it("forms a cluster rather than map-wide scatter", () => {
    const plane = patternPlane({ entry: { x: 0, y: 0 } });
    const encounter = CONTENT_REGISTRY.encounters.find((row) => row.id === "rats")!;
    const cells = cellsForEncounterPattern(plane, new Set(), encounter, 3, placementParts(plane, "rats"));
    expect(cells).not.toBeNull();
    expect(cells).toHaveLength(3);
    const cx = Math.round(cells!.reduce((sum, cell) => sum + cell.x, 0) / cells!.length);
    const cy = Math.round(cells!.reduce((sum, cell) => sum + cell.y, 0) / cells!.length);
    expect(cells!.every((cell) => chebyshev(cell, { x: cx, y: cy }) <= 2)).toBe(true);
  });

  it("forms a line placement", () => {
    const plane = patternPlane({ entry: { x: 0, y: 0 } });
    const encounter = CONTENT_REGISTRY.encounters.find((row) => row.id === "bandit_patrol")!;
    const cells = cellsForEncounterPattern(plane, new Set(), encounter, 3, placementParts(plane, "line"));
    expect(cells).not.toBeNull();
    const sameRow = cells!.every((cell) => cell.y === cells![0]!.y);
    const sameCol = cells!.every((cell) => cell.x === cells![0]!.x);
    expect(sameRow || sameCol).toBe(true);
    const axis = sameRow ? cells!.map((cell) => cell.x).sort((a, b) => a - b) : cells!.map((cell) => cell.y).sort((a, b) => a - b);
    expect(axis[axis.length - 1]! - axis[0]!).toBe(axis.length - 1);
  });

  it("anchors guard_door placement to a transition fixture", () => {
    const plane = patternPlane({
      family: "dungeon",
      plane: { a: 4, b: 5 },
      terrain: "cave_floor",
      entry: { x: 0, y: 0 },
      features: [{ x: 8, y: 8, feature: "transition_fixture" }],
    });
    const encounter = CONTENT_REGISTRY.encounters.find((row) => row.id === "golem_guard")!;
    const cells = cellsForEncounterPattern(plane, new Set(), encounter, 1, placementParts(plane, "guard"));
    expect(cells).toHaveLength(1);
    expect(manhattan(cells![0]!, { x: 8, y: 8 })).toBe(1);
    expect(cells![0]!.x === 8 && cells![0]!.y === 8).toBe(false);
  });

  it("keeps hidden_edge and room placements distinct", () => {
    const walls: { x: number; y: number }[] = [];
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const inRoom = x >= 2 && x <= 6 && y >= 2 && y <= 6;
        const inCorridor = x >= 7 && x <= 12 && y === 4;
        if (!inRoom && !inCorridor) {
          walls.push({ x, y });
        }
      }
    }
    const plane = patternPlane({
      family: "dungeon",
      plane: { a: 5, b: 6 },
      terrain: "cave_floor",
      walls,
      entry: { x: 2, y: 2 },
    });
    const hidden = CONTENT_REGISTRY.encounters.find((row) => row.id === "cave_ambush")!;
    const room = CONTENT_REGISTRY.encounters.find((row) => row.id === "ruin_mix")!;
    const hiddenCells = cellsForEncounterPattern(plane, new Set(), hidden, 2, placementParts(plane, "hidden"));
    const roomCells = cellsForEncounterPattern(plane, new Set(), room, 2, placementParts(plane, "room"));
    expect(hiddenCells).not.toBeNull();
    expect(roomCells).not.toBeNull();
    const hiddenKeys = hiddenCells!.map((cell) => `${cell.x},${cell.y}`).sort().join("|");
    const roomKeys = roomCells!.map((cell) => `${cell.x},${cell.y}`).sort().join("|");
    expect(hiddenKeys).not.toBe(roomKeys);
    expect(hiddenCells!.every((cell) => cell.x === 0 || cell.y === 0 || cell.x === 15 || cell.y === 15 || walls.some((wall) => manhattan(cell, wall) === 1))).toBe(true);
    expect(roomCells!.every((cell) => cell.x >= 2 && cell.x <= 6 && cell.y >= 2 && cell.y <= 6)).toBe(true);
  });

  it("excludes encounters by family and required terrain", () => {
    const grass = patternPlane({ family: "aboveground", plane: { a: 0, b: 1 } });
    const cave = patternPlane({ family: "dungeon", plane: { a: 4, b: 5 }, terrain: "cave_floor" });
    const ambush = CONTENT_REGISTRY.encounters.find((row) => row.id === "cave_ambush")!;
    const wolves = CONTENT_REGISTRY.encounters.find((row) => row.id === "wolves")!;
    expect(encounterEligibleForPlane(ambush, grass)).toBe(false);
    expect(encounterEligibleForPlane(wolves, grass)).toBe(true);
    expect(encounterEligibleForPlane(ambush, cave)).toBe(true);
    expect(encounterEligibleForPlane(wolves, cave)).toBe(false);
  });

  it("does not spawn on entry or required transition cells", () => {
    const plane = patternPlane({
      entry: { x: 5, y: 5 },
      features: [{ x: 10, y: 10, feature: "transition_fixture" }],
    });
    const encounter = CONTENT_REGISTRY.encounters.find((row) => row.id === "rats")!;
    const cells = cellsForEncounterPattern(plane, new Set(), encounter, 3, placementParts(plane, "safety"));
    expect(cells).not.toBeNull();
    for (const cell of cells!) {
      expect(manhattan(cell, { x: 5, y: 5 })).toBeGreaterThanOrEqual(2);
      expect(cell.x === 10 && cell.y === 10).toBe(false);
    }
  });
});

describe("hazard movement triggers", () => {
  it("triggers onEnter once per forced-move cell and skips a blocked destination", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    runtime.save.actors = [player];
    player.x = 2;
    player.y = 2;
    withTerrain(runtime, "lava", 3, 2);
    withTerrain(runtime, "lava", 4, 2);
    const blocker = createMonsterActor("blocker", "rat", { a: player.plane.a, b: player.plane.b }, 4, 2);
    blocker.blocking = true;
    runtime.save.actors.push(blocker);
    const events: { type: string; detail?: string; x?: number; y?: number }[] = [];
    forcedMove(runtime.save, runtime.currentPlaneBase, player, { x: 1, y: 2 }, 3, "push", events);
    const lavaHits = events.filter((event) => event.type === "hazard_triggered" && event.detail === "lava");
    expect(lavaHits).toHaveLength(1);
    expect(lavaHits[0]?.x).toBe(3);
    expect(player.x).toBe(3);
    expect(events.some((event) => event.type === "forced_move_blocked")).toBe(true);
  });

  it("teleports within plane with occupancy and destination onEnter only", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    runtime.save.actors = [player];
    player.x = 2;
    player.y = 2;
    withTerrain(runtime, "lava", 3, 2);
    withTerrain(runtime, "lava", 5, 2);
    const events: { type: string; detail?: string; x?: number }[] = [];
    expect(teleportWithinPlane(runtime.save, runtime.currentPlaneBase, player, { x: 5, y: 2 }, 4, events)).toBe(true);
    expect(player.x).toBe(5);
    const lavaHits = events.filter((event) => event.type === "hazard_triggered" && event.detail === "lava");
    expect(lavaHits).toHaveLength(1);
    expect(lavaHits[0]?.x).toBe(5);
    expect(teleportWithinPlane(runtime.save, runtime.currentPlaneBase, player, { x: 5, y: 2 }, 4, events)).toBe(true);
    const occupied = createMonsterActor("block", "rat", player.plane, 8, 2);
    runtime.save.actors.push(occupied);
    expect(teleportWithinPlane(runtime.save, runtime.currentPlaneBase, player, { x: 8, y: 2 }, 4, events)).toBe(false);
    expect(player.x).toBe(5);
  });

  it("fires onLeave and onInteract including consumed one-shots", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    runtime.save.actors = [player];
    runtime.currentPlaneBase = openPlane();
    player.plane = { ...runtime.currentPlaneBase.plane };
    player.x = 2;
    player.y = 2;
    withTerrain(runtime, "burning_ground", 2, 2);
    const events: { type: string; detail?: string }[] = [];
    expect(relocateActor(runtime.save, runtime.currentPlaneBase, player, { x: 3, y: 2 }, events, "step")).toBe(true);
    expect(events.some((event) => event.type === "hazard_triggered" && event.detail === "burning_ground")).toBe(true);

    const interact = newGame();
    const actor = playerActor(interact);
    interact.save.actors = [actor];
    const anchor = interact.currentPlaneBase.namedPoints.find((point) => point.id === "safe_anchor");
    expect(anchor).toBeDefined();
    actor.x = anchor!.x;
    actor.y = anchor!.y;
    withTerrain(interact, "hidden_spikes", actor.x, actor.y);
    applyPlayerCommand(interact, { type: "queue", action: { type: "interact" } });
    const first = advanceTick(interact);
    expect(first.events.some((event) => event.type === "hazard_triggered" && event.detail === "hidden_spikes")).toBe(true);
    applyPlayerCommand(interact, { type: "queue", action: { type: "interact" } });
    const second = advanceTick(interact);
    expect(second.events.some((event) => event.type === "hazard_triggered" && event.detail === "hidden_spikes")).toBe(false);
  });
});

describe("mechanic-faithful witness", () => {
  it("executes seed 0 through real transition, death, quest and shop boundaries", () => {
    const runtime = newGame();
    const result = executeWitness(runtime, runtime.world.witness);
    expect(result.ok, result.message).toBe(true);
    const shopStep = runtime.world.witness.find((step) => step.type === "BUY_ITEM");
    const questStep = runtime.world.witness.find((step) => step.type === "COMPLETE_QUEST");
    expect(shopStep || questStep).toBeTruthy();
    expect(runtime.world.witness.some((step) => step.type === "FINAL_BOSS_AVAILABLE" || step.type === "REACH_OLYMPUS")).toBe(true);
  });

  it("fails a gated transition rather than switching planes anyway", () => {
    const runtime = newGame();
    const gated = runtime.topology.transitions.find((transition) => {
      const gate = runtime.topology.gates.find((row) => row.id === transition.gateId);
      return Boolean(gate?.requiredFlag || gate?.requiredResourceId || gate?.guardianInstanceId || gate?.requiredAbilityId || gate?.requiredItemId);
    });
    expect(gated).toBeDefined();
    const beforeDest = { ...gated!.destinationPlane };
    const result = executeWitness(runtime, [{ type: "TRAVERSE_TRANSITION", id: gated!.id }]);
    expect(result.ok).toBe(false);
    expect(runtime.save.plane.a === beforeDest.a && runtime.save.plane.b === beforeDest.b).toBe(false);
  });

  it("does not grant a guardian reward unless the death path runs", () => {
    const runtime = newGame();
    const guardian = runtime.topology.guardianInstances[0]!;
    expect(switchCurrentPlane(runtime, guardian.plane)).not.toBeNull();
    const sourceId = `source.guardian_reward.${guardian.id}`;
    runtime.save.actors = runtime.save.actors.filter((actor) => actor.id !== guardian.id);
    expect(runtime.save.collectedSources.includes(sourceId)).toBe(false);
    expect(runtime.save.flags.includes(`defeated:${guardian.id}`)).toBe(false);

    const throughDeath = newGame();
    const deathResult = executeWitness(throughDeath, [{ type: "DEFEAT_GUARDIAN", id: guardian.id }]);
    expect(deathResult.ok).toBe(true);
    expect(throughDeath.save.flags.includes(`defeated:${guardian.id}`)).toBe(true);
    expect(deathResult.events.some((event) => event.type === "monster_died" && event.actorId === guardian.id)).toBe(true);
  });

  it("does not complete a quest until its objective is satisfied", () => {
    const runtime = newGame();
    const result = executeWitness(runtime, [{ type: "COMPLETE_QUEST", id: "q_first_crack" }]);
    expect(result.ok).toBe(false);
    startQuest(runtime, "q_first_crack", []);
    expect(questState(runtime.save, "q_first_crack")).not.toBe("complete");
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
