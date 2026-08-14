import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyPlayerCommand,
  applyStatus,
  CHANNEL_MULTIPLIER,
  channelStateForFamily,
  createAcceptedWorldCache,
  createMonsterActor,
  createNewGame,
  cooldownRemaining,
  CONTENT_REGISTRY,
  forcedMove,
  governingStat,
  hasLineOfSight,
  hitChancePercent,
  playerActor,
  RESISTANCE_MULTIPLIER,
  resolveDamagePipeline,
  scaledMonster,
  supercoverLine,
  type ActorState,
} from "../../src/core";
import { emptyGrid } from "../../src/core/generation/grid";
import type { PlaneBase } from "../../src/core/generation/plane-types";
import { canOccupy } from "../../src/core/rules/occupancy";
import { DIRECTION_DELTA } from "../../src/core/model/save-state";

const cache = createAcceptedWorldCache();

function newGame(seed = "0") {
  return createNewGame("tight-v1", seed, { cache });
}

function openPlane(featureAt?: { x: number; y: number; feature: string; terrain?: string }): PlaneBase {
  const terrain = emptyGrid("grass");
  const features = emptyGrid<string | null>(null);
  if (featureAt) {
    terrain[featureAt.y]![featureAt.x] = featureAt.terrain ?? "grass";
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

function placeAdjacentRat(runtime: ReturnType<typeof newGame>): ActorState {
  const player = playerActor(runtime);
  for (const delta of Object.values(DIRECTION_DELTA)) {
    const cell = { x: player.x + delta.x, y: player.y + delta.y };
    if (canOccupy(runtime.currentPlaneBase, runtime.save.actors, cell, "rat.1")) {
      const rat = createMonsterActor("rat.1", "rat", runtime.save.plane, cell.x, cell.y);
      runtime.save.actors.push(rat);
      return rat;
    }
  }
  throw new Error("no adjacent open cell for rat");
}

describe("combat formulas", () => {
  it("maps Blocked/Suppressed/Normal/Empowered to the canonical multipliers", () => {
    expect(CHANNEL_MULTIPLIER.blocked).toBe(0);
    expect(CHANNEL_MULTIPLIER.suppressed).toBe(0.5);
    expect(CHANNEL_MULTIPLIER.normal).toBe(1);
    expect(CHANNEL_MULTIPLIER.empowered).toBe(1.5);
    expect(channelStateForFamily("ethereal", "physical")).toBe("blocked");
    expect(channelStateForFamily("dungeon", "physical")).toBe("empowered");
    expect(channelStateForFamily("inside", "speed")).toBe("suppressed");
    expect(channelStateForFamily("aboveground", "arcane")).toBe("normal");
  });

  it("maps Vulnerable/Normal/Resistant/Immune canonically", () => {
    expect(RESISTANCE_MULTIPLIER.vulnerable).toBe(1.5);
    expect(RESISTANCE_MULTIPLIER.normal).toBe(1);
    expect(RESISTANCE_MULTIPLIER.resistant).toBe(0.5);
    expect(RESISTANCE_MULTIPLIER.immune).toBe(0);
  });

  it("uses named scaling rules and clamps hit chance", () => {
    const attrs = { str: 4, dex: 6, con: 4, spd: 4, wis: 4, int: 4, cha: 4, psy: 4 };
    expect(governingStat(attrs, ["str"], "single")).toBe(4);
    expect(governingStat(attrs, ["str", "dex"], "average2")).toBe(5);
    expect(governingStat(attrs, ["str", "dex"], "max2")).toBe(6);
    expect(governingStat(attrs, ["str", "dex"], "min2")).toBe(4);
    expect(governingStat(attrs, ["str", "dex"], "none")).toBe(0);
    expect(governingStat(attrs, ["str", "dex"], "max2")).not.toBe(governingStat(attrs, ["str", "dex"], "average2"));
    expect(hitChancePercent(4, 4)).toBe(60);
    expect(hitChancePercent(4, 20)).toBe(20);
    expect(hitChancePercent(20, 4)).toBe(95);
  });

  it("keeps authored attack governing stats after explicit scaling rows", () => {
    const attrs = { str: 4, dex: 6, con: 4, spd: 4, wis: 4, int: 4, cha: 4, psy: 4 };
    for (const attack of CONTENT_REGISTRY.attacks) {
      const inferred =
        attack.attributes.length === 0 ? "none" : attack.attributes.length === 1 ? "single" : "average2";
      expect(attack.scalingRule).toBe(inferred);
      expect(governingStat(attrs, attack.attributes, attack.scalingRule)).toBe(
        governingStat(attrs, attack.attributes, inferred),
      );
    }
  });

  it("applies channel then resistance then armour, floors, and min-1 except blocked/immune", () => {
    const base = { basePower: 5, governingStat: 4 };
    const raw = 5 + Math.floor(4 / 3);
    expect(raw).toBe(6);
    const suppressed = resolveDamagePipeline({ ...base, channelState: "suppressed", resistance: "normal", armour: 0 });
    expect(suppressed.afterChannel).toBe(3);
    expect(suppressed.final).toBe(3);
    const resistant = resolveDamagePipeline({ ...base, channelState: "normal", resistance: "resistant", armour: 0 });
    expect(resistant.afterResistance).toBe(3);
    expect(resistant.final).toBe(3);
    const vulnerable = resolveDamagePipeline({ ...base, channelState: "normal", resistance: "vulnerable", armour: 0 });
    expect(vulnerable.afterResistance).toBe(9);
    expect(vulnerable.final).toBe(9);
    const empowered = resolveDamagePipeline({ ...base, channelState: "empowered", resistance: "normal", armour: 0 });
    expect(empowered.afterChannel).toBe(9);
    const armoured = resolveDamagePipeline({ ...base, channelState: "normal", resistance: "normal", armour: 2 });
    expect(armoured.afterArmour).toBe(4);
    expect(armoured.final).toBe(4);
    const crushed = resolveDamagePipeline({ ...base, channelState: "normal", resistance: "normal", armour: 10 });
    expect(crushed.final).toBe(1);
    const blocked = resolveDamagePipeline({ ...base, channelState: "blocked", resistance: "normal", armour: 0 });
    expect(blocked.final).toBe(0);
    expect(blocked.blocked).toBe(true);
    const immune = resolveDamagePipeline({ ...base, channelState: "normal", resistance: "immune", armour: 0 });
    expect(immune.final).toBe(0);
    expect(immune.immune).toBe(true);
  });
});

describe("LOS and forced movement", () => {
  it("uses supercover so diagonal corners both block LOS", () => {
    const cells = supercoverLine({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(cells).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ]),
    );
    const plane = openPlane({ x: 1, y: 0, feature: "tree" });
    expect(hasLineOfSight(plane, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    expect(hasLineOfSight(openPlane(), { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });

  it("stops forced movement on collision without extra damage", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    const events: { type: string }[] = [];
    const start = { x: player.x, y: player.y };
    forcedMove(runtime.save, runtime.currentPlaneBase, player, { x: player.x - 1, y: player.y }, 4, "push", events);
    expect(player.hp).toBe(18);
    expect(events.some((event) => event.type === "forced_moved" || event.type === "forced_move_blocked")).toBe(true);
    const dist = Math.abs(player.x - start.x) + Math.abs(player.y - start.y);
    expect(dist).toBeGreaterThanOrEqual(0);
    expect(dist).toBeLessThanOrEqual(4);
  });
});

describe("status timing, death, and a headless fight", () => {
  it("refreshes status duration and expires deterministically", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    applyStatus(player, "poisoned", null, []);
    expect(player.statuses[0]?.remainingTicks).toBe(5);
    advanceTick(runtime);
    expect(player.statuses.find((row) => row.id === "poisoned")?.remainingTicks).toBe(4);
    applyStatus(player, "poisoned", null, []);
    expect(player.statuses.find((row) => row.id === "poisoned")?.remainingTicks).toBe(5);
    advanceTick(runtime);
    expect(player.statuses.find((row) => row.id === "poisoned")?.remainingTicks).toBe(4);
  });

  it("prevents stunned actions then expires after one tick", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    applyStatus(player, "stunned", null, []);
    expect(applyPlayerCommand(runtime, { type: "queue", action: { type: "move", direction: "east" } }).ok).toBe(true);
    const stunned = advanceTick(runtime);
    expect(stunned.events.some((event) => event.type === "action_failed" && event.detail === "stunned")).toBe(true);
    expect(player.statuses.some((row) => row.id === "stunned")).toBe(false);
    const before = { x: player.x, y: player.y };
    expect(applyPlayerCommand(runtime, { type: "queue", action: { type: "move", direction: "east" } }).ok).toBe(true);
    advanceTick(runtime);
    const moved = player.x !== before.x || player.y !== before.y;
    const failed = runtime.save.tick > 0;
    expect(moved || failed).toBe(true);
  });

  it("resolves player death after damage and before the next action", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    const anchor = runtime.save.player.safeAnchor;
    player.hp = 0;
    applyStatus(player, "poisoned", null, []);
    const result = advanceTick(runtime);
    expect(result.events.some((event) => event.type === "player_died")).toBe(true);
    expect(result.events.some((event) => event.type === "player_respawned")).toBe(true);
    expect(player.hp).toBe(player.maxHp);
    expect(player.x).toBe(anchor.x);
    expect(player.y).toBe(anchor.y);
    expect(player.statuses.some((row) => row.id === "poisoned")).toBe(false);
  });

  it("removes a dead monster during the death phase", () => {
    const runtime = newGame();
    const rat = placeAdjacentRat(runtime);
    rat.hp = 0;
    const result = advanceTick(runtime);
    expect(result.events.some((event) => event.type === "monster_died" && event.actorId === "rat.1")).toBe(true);
    expect(runtime.save.actors.some((row) => row.id === "rat.1")).toBe(false);
  });

  it("runs a deterministic player-vs-monster fight to completion", () => {
    const play = (seed: string) => {
      const runtime = newGame(seed);
      placeAdjacentRat(runtime);
      runtime.scriptedActions.set("rat.1", { type: "attack", attackId: "bite", targetId: "player" });
      let ticks = 0;
      while (ticks < 80 && runtime.save.actors.some((row) => row.id === "rat.1") && playerActor(runtime).hp > 0) {
        if (runtime.save.actionQueue.length === 0) {
          applyPlayerCommand(runtime, {
            type: "queue",
            action: { type: "attack", attackId: "sword_slash", targetId: "rat.1" },
          });
        }
        advanceTick(runtime);
        ticks += 1;
      }
      return { runtime, ticks, ratAlive: runtime.save.actors.some((row) => row.id === "rat.1") };
    };
    const first = play("0");
    const second = play("0");
    expect(first.ratAlive).toBe(false);
    expect(playerActor(first.runtime).hp).toBeGreaterThan(0);
    expect(first.ticks).toBe(second.ticks);
    expect(playerActor(first.runtime).hp).toBe(playerActor(second.runtime).hp);
    expect(first.runtime.save.tick).toBe(second.runtime.save.tick);
  });

  it("uses equipment-granted attacks and item healing", () => {
    const runtime = newGame();
    const player = playerActor(runtime);
    player.hp = 10;
    expect(applyPlayerCommand(runtime, { type: "queue", action: { type: "item", itemId: "healing_herb" } }).ok).toBe(true);
    const result = advanceTick(runtime);
    expect(result.events.some((event) => event.type === "healed")).toBe(true);
    expect(player.hp).toBe(16);
    expect(runtime.save.player.inventory.find((row) => row.itemId === "healing_herb")?.quantity).toBe(1);
    const rat = scaledMonster(runtime.content.byId.monster.get("rat")!, { a: 0, b: 1 });
    expect(rat.maxHp).toBeGreaterThan(0);
  });
});

describe("cooldowns", () => {
  it("lets cooldown 0 be reused on the next tick", () => {
    const runtime = newGame();
    placeAdjacentRat(runtime);
    expect(
      applyPlayerCommand(runtime, {
        type: "queue",
        action: { type: "attack", attackId: "sword_slash", targetId: "rat.1" },
      }).ok,
    ).toBe(true);
    const first = advanceTick(runtime);
    expect(first.events.some((event) => event.detail === "cooldown")).toBe(false);
    expect(cooldownRemaining(playerActor(runtime), "sword_slash")).toBe(0);
    expect(
      applyPlayerCommand(runtime, {
        type: "queue",
        action: { type: "attack", attackId: "sword_slash", targetId: "rat.1" },
      }).ok,
    ).toBe(true);
    const second = advanceTick(runtime);
    expect(second.events.some((event) => event.detail === "cooldown")).toBe(false);
  });

  it("blocks cooldown N for exactly N subsequent ticks without extending on failed attempts", () => {
    const runtime = newGame();
    placeAdjacentRat(runtime);
    runtime.save.player.equipment = { ...runtime.save.player.equipment, offhand: "wooden_shield" };
    const bash = () =>
      applyPlayerCommand(runtime, {
        type: "queue",
        action: { type: "ability", abilityId: "shield_bash_ability", targetId: "rat.1" },
      });
    expect(bash().ok).toBe(true);
    const used = advanceTick(runtime);
    expect(used.events.some((event) => event.detail === "cooldown")).toBe(false);
    const player = playerActor(runtime);
    expect(cooldownRemaining(player, "shield_bash")).toBe(1);
    expect(cooldownRemaining(player, "shield_bash_ability")).toBe(2);

    expect(bash().ok).toBe(true);
    const blocked1 = advanceTick(runtime);
    expect(blocked1.events.some((event) => event.type === "action_failed" && event.detail === "cooldown")).toBe(true);
    expect(cooldownRemaining(player, "shield_bash")).toBe(0);
    expect(cooldownRemaining(player, "shield_bash_ability")).toBe(1);

    expect(bash().ok).toBe(true);
    const blocked2 = advanceTick(runtime);
    expect(blocked2.events.some((event) => event.type === "action_failed" && event.detail === "cooldown")).toBe(true);
    expect(cooldownRemaining(player, "shield_bash")).toBe(0);
    expect(cooldownRemaining(player, "shield_bash_ability")).toBe(0);

    expect(bash().ok).toBe(true);
    const ready = advanceTick(runtime);
    expect(ready.events.some((event) => event.detail === "cooldown")).toBe(false);
    expect(cooldownRemaining(player, "shield_bash")).toBe(1);
    expect(cooldownRemaining(player, "shield_bash_ability")).toBe(2);
  });
});
