import { CONTENT_REGISTRY } from "../data/registry";
import { chance, compareStableIds, percentile, semantic } from "../generation/semantic-random";
import type { PlaneBase } from "../generation/plane-types";
import type { AttackDefinition } from "../model/content-types";
import type { FamilyId } from "../model/ids";
import type { MapCoordinate } from "../model/plane";
import type { ActorState, IntentionalAction, SaveState } from "../model/save-state";
import {
  actorIsBlinded,
  actorPreventsIntentionalActions,
  actorPreventsSpells,
  channelStateForFamily,
  charmedSourceIds,
  cooldownRemaining,
  effectiveAttributes,
  flatArmour,
  grantedAbilityIds,
  grantedAttackIds,
  resistanceFor,
  startCooldown,
} from "./actor-stats";
import {
  applyEffectIds,
  applyStatus,
  breakHiddenOnHostile,
  confuseDirection,
  hiddenIsDetectable,
} from "./apply-effects";
import { governingStat, hitChancePercent, resolveDamagePipeline } from "./combat-math";
import { hasLineOfSight } from "./los";
import { manhattan } from "../generation/grid";
import { actorsInCells, attackRangeDistance, orthogonalAdjacent, shapeCells } from "./targeting";
import type { TickEvent } from "./tick-events";

function fail(actorId: string, detail: string): TickEvent[] {
  return [{ type: "action_failed", actorId, detail }];
}

function aimPoint(save: SaveState, actor: ActorState, action: IntentionalAction): MapCoordinate {
  if (action.targetId) {
    const target = save.actors.find((row) => row.id === action.targetId);
    if (target) {
      return { x: target.x, y: target.y };
    }
  }
  if (action.targetX !== undefined && action.targetY !== undefined) {
    return { x: action.targetX, y: action.targetY };
  }
  return { x: actor.x, y: actor.y };
}

function collectTargets(
  save: SaveState,
  plane: PlaneBase,
  attacker: ActorState,
  attack: AttackDefinition,
  action: IntentionalAction,
): ActorState[] | { error: string } {
  const aim = aimPoint(save, attacker, action);
  const adjacent = orthogonalAdjacent(attacker, plane.wraps);
  if (attack.shape === "adjacent") {
    const target = action.targetId ? save.actors.find((row) => row.id === action.targetId) : undefined;
    if (!target) {
      return { error: "invalid target" };
    }
    if (!adjacent.some((cell) => cell.x === target.x && cell.y === target.y)) {
      return { error: "out of range" };
    }
    return [target];
  }
  if (attack.shape === "single") {
    const target = action.targetId ? save.actors.find((row) => row.id === action.targetId) : undefined;
    if (!target) {
      return { error: "invalid target" };
    }
    if (attackRangeDistance(attacker, target) > attack.range) {
      return { error: "out of range" };
    }
    if (attack.requiresLos && !hasLineOfSight(plane, attacker, target)) {
      return { error: "no line of sight" };
    }
    return [target];
  }
  if (attack.range > 0 && attackRangeDistance(attacker, aim) > attack.range) {
    return { error: "out of range" };
  }
  const cells = shapeCells(attack, attacker, aim, plane.wraps);
  if (attack.shape === "line" && cells.length === 0) {
    return { error: "invalid line" };
  }
  return actorsInCells(save.actors, cells).sort((left, right) => compareStableIds(left.id, right.id));
}

export interface CombatLegalOptions {
  readonly origin?: MapCoordinate;
  readonly ignoreCooldown?: boolean;
}

function actorAtOrigin(actor: ActorState, origin?: MapCoordinate): ActorState {
  return origin ? { ...actor, x: origin.x, y: origin.y } : actor;
}

export function combatActionLegal(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  action: IntentionalAction,
  options: CombatLegalOptions = {},
): boolean {
  const viewed = actorAtOrigin(actor, options.origin);
  if (action.type === "attack") {
    const attackId = action.attackId;
    if (!attackId || !grantedAttackIds(save, actor).includes(attackId)) {
      return false;
    }
    if (!options.ignoreCooldown && cooldownRemaining(actor, attackId) > 0) {
      return false;
    }
    const attack = CONTENT_REGISTRY.byId.attack.get(attackId);
    if (!attack) {
      return false;
    }
    if (channelStateForFamily(save.family, attack.channel) === "blocked") {
      return false;
    }
    const collected = collectTargets(save, plane, viewed, attack, action);
    if ("error" in collected) {
      return false;
    }
    if (action.targetId && !collected.some((row) => row.id === action.targetId)) {
      return false;
    }
    return collected.length > 0;
  }
  if (action.type === "ability") {
    const abilityId = action.abilityId;
    if (!abilityId || !grantedAbilityIds(save, actor).includes(abilityId)) {
      return false;
    }
    const ability = CONTENT_REGISTRY.byId.ability.get(abilityId);
    if (!ability) {
      return false;
    }
    if (ability.kind === "dimensional" || ability.kind === "item" || ability.kind === "learn_event") {
      return false;
    }
    if (ability.tags.includes("spell") && actorPreventsSpells(actor)) {
      return false;
    }
    if (
      !options.ignoreCooldown &&
      (cooldownRemaining(actor, ability.id) > 0 ||
        (ability.attackId !== null && cooldownRemaining(actor, ability.attackId) > 0))
    ) {
      return false;
    }
    if (!ability.attackId) {
      return true;
    }
    const attack = CONTENT_REGISTRY.byId.attack.get(ability.attackId);
    if (!attack) {
      return false;
    }
    if (channelStateForFamily(save.family, attack.channel) === "blocked") {
      return false;
    }
    const collected = collectTargets(save, plane, viewed, attack, action);
    if ("error" in collected) {
      return false;
    }
    if (action.targetId && !collected.some((row) => row.id === action.targetId)) {
      return false;
    }
    return collected.length > 0;
  }
  return false;
}

function targetStillLegal(
  plane: PlaneBase,
  attacker: ActorState,
  target: ActorState,
  attack: AttackDefinition,
): boolean {
  if (attack.shape === "adjacent") {
    if (!orthogonalAdjacent(attacker, plane.wraps).some((cell) => cell.x === target.x && cell.y === target.y)) {
      return false;
    }
  } else if (attack.shape === "single") {
    if (attackRangeDistance(attacker, target) > attack.range) {
      return false;
    }
  }
  if (attack.requiresLos && !hasLineOfSight(plane, attacker, target)) {
    return false;
  }
  if (actorIsBlinded(attacker) && attack.requiresLos && manhattan(attacker, target) > 1) {
    return false;
  }
  if (!hiddenIsDetectable(attacker, target) && (attack.shape === "adjacent" || attack.shape === "single")) {
    return false;
  }
  if (charmedSourceIds(attacker).includes(target.id)) {
    return false;
  }
  return true;
}

function rollHit(
  save: SaveState,
  attackerId: string,
  actionId: string,
  targetId: string,
  percent: number,
): boolean {
  return chance(
    [
      semantic.string("combat.hit"),
      semantic.string(save.worldSeed),
      semantic.i64(save.tick),
      semantic.string(attackerId),
      semantic.string(actionId),
      semantic.string(targetId),
    ],
    percent,
  );
}

export function resolveAttackOnTargets(
  save: SaveState,
  plane: PlaneBase,
  attacker: ActorState,
  attack: AttackDefinition,
  targets: readonly ActorState[],
  extraEffectIds: readonly string[],
  family: FamilyId,
  events: TickEvent[],
): void {
  const attackerAttrs = effectiveAttributes(save, attacker);
  const gov = governingStat(attackerAttrs, attack.attributes, attack.scalingRule);
  const attackScore = gov + attack.accuracy;
  const channel = channelStateForFamily(family, attack.channel);
  if (channel === "blocked") {
    events.push({ type: "action_failed", actorId: attacker.id, detail: "channel blocked", attackId: attack.id });
    return;
  }
  breakHiddenOnHostile(attacker, events);
  for (const target of targets) {
    if (!save.actors.includes(target)) {
      continue;
    }
    if (!targetStillLegal(plane, attacker, target, attack)) {
      events.push({ type: "action_failed", actorId: attacker.id, targetId: target.id, detail: "illegal target" });
      continue;
    }
    const defenceAttrs = effectiveAttributes(save, target);
    const defenceScore = defenceAttrs[attack.defence];
    const percent = hitChancePercent(attackScore, defenceScore);
    const hit = rollHit(save, attacker.id, attack.id, target.id, percent);
    if (!hit) {
      events.push({ type: "attack_miss", actorId: attacker.id, targetId: target.id, attackId: attack.id });
      continue;
    }
    events.push({ type: "attack_hit", actorId: attacker.id, targetId: target.id, attackId: attack.id });
    if (attacker.kind === "player") {
      target.lastAffectedTick = save.tick;
    }
    if (attack.damageType) {
      const pipeline = resolveDamagePipeline({
        basePower: attack.power,
        governingStat: gov,
        channelState: channel,
        resistance: resistanceFor(save, target, attack.damageType),
        armour: flatArmour(save, target, attack.damageType),
      });
      if (pipeline.final > 0) {
        target.hp -= pipeline.final;
        events.push({
          type: "damage_taken",
          actorId: target.id,
          targetId: attacker.id,
          amount: pipeline.final,
          detail: attack.damageType,
          attackId: attack.id,
        });
      }
    }
    if (attack.onHitStatusId) {
      applyStatus(target, attack.onHitStatusId, attacker.id, events);
    }
    if (extraEffectIds.length > 0) {
      applyEffectIds(save, plane, extraEffectIds, target, attacker, events);
    }
  }
}

function maybeConfuseMove(save: SaveState, actor: ActorState, action: IntentionalAction): IntentionalAction {
  if (action.type !== "move" || !action.direction || !actor.statuses.some((row) => row.id === "confused")) {
    return action;
  }
  const turns = percentile([
    semantic.string("status.confused.turn"),
    semantic.string(save.worldSeed),
    semantic.i64(save.tick),
    semantic.string(actor.id),
  ]);
  return { ...action, direction: confuseDirection(action.direction, turns % 4) };
}

export function prepareAction(save: SaveState, actor: ActorState, action: IntentionalAction): IntentionalAction | { failed: string } {
  if (actorPreventsIntentionalActions(actor) && action.type !== "wait") {
    return { failed: "stunned" };
  }
  return maybeConfuseMove(save, actor, action);
}

export function resolveAttackAction(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  action: IntentionalAction,
  family: FamilyId,
): TickEvent[] {
  const attackId = action.attackId;
  if (!attackId) {
    return fail(actor.id, "missing attack");
  }
  if (!grantedAttackIds(save, actor).includes(attackId)) {
    return fail(actor.id, "attack not granted");
  }
  if (cooldownRemaining(actor, attackId) > 0) {
    return fail(actor.id, "cooldown");
  }
  const attack = CONTENT_REGISTRY.byId.attack.get(attackId);
  if (!attack) {
    return fail(actor.id, "unknown attack");
  }
  const collected = collectTargets(save, plane, actor, attack, action);
  if ("error" in collected) {
    return fail(actor.id, collected.error);
  }
  const events: TickEvent[] = [];
  resolveAttackOnTargets(save, plane, actor, attack, collected, [], family, events);
  startCooldown(actor, attack.id, attack.cooldown, save.tick);
  return events;
}

export function resolveAbilityAction(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  action: IntentionalAction,
  family: FamilyId,
): TickEvent[] {
  const abilityId = action.abilityId;
  if (!abilityId) {
    return fail(actor.id, "missing ability");
  }
  if (!grantedAbilityIds(save, actor).includes(abilityId)) {
    return fail(actor.id, "ability not granted");
  }
  const ability = CONTENT_REGISTRY.byId.ability.get(abilityId);
  if (!ability) {
    return fail(actor.id, "unknown ability");
  }
  if (ability.tags.includes("spell") && actorPreventsSpells(actor)) {
    return fail(actor.id, "silenced");
  }
  if (cooldownRemaining(actor, ability.id) > 0 || (ability.attackId && cooldownRemaining(actor, ability.attackId) > 0)) {
    return fail(actor.id, "cooldown");
  }
  const extra = ability.effectOrBundleId ? [ability.effectOrBundleId] : [];
  const events: TickEvent[] = [];
  if (ability.attackId) {
    const attack = CONTENT_REGISTRY.byId.attack.get(ability.attackId);
    if (!attack) {
      return fail(actor.id, "unknown attack");
    }
    const collected = collectTargets(save, plane, actor, attack, action);
    if ("error" in collected) {
      return fail(actor.id, collected.error);
    }
    resolveAttackOnTargets(save, plane, actor, attack, collected, extra, family, events);
    startCooldown(actor, attack.id, attack.cooldown, save.tick);
  } else {
    breakHiddenOnHostile(actor, events);
    applyEffectIds(save, plane, extra, actor, actor, events);
  }
  startCooldown(actor, ability.id, ability.cooldown, save.tick);
  return events;
}

export function consumeItem(save: SaveState, itemId: string): boolean {
  const index = save.player.inventory.findIndex((row) => row.itemId === itemId && row.quantity > 0);
  if (index < 0) {
    return false;
  }
  const stack = save.player.inventory[index]!;
  if (stack.quantity <= 1) {
    save.player.inventory.splice(index, 1);
  } else {
    save.player.inventory[index] = { itemId: stack.itemId, quantity: stack.quantity - 1 };
  }
  return true;
}

export function resolveItemAction(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  action: IntentionalAction,
): TickEvent[] {
  if (actor.kind !== "player" || !action.itemId) {
    return fail(actor.id, "missing item");
  }
  const item = CONTENT_REGISTRY.byId.item.get(action.itemId);
  if (!item?.useAbilityId) {
    return fail(actor.id, "item not usable");
  }
  if (!save.player.inventory.some((row) => row.itemId === item.id && row.quantity > 0)) {
    return fail(actor.id, "item not in inventory");
  }
  const ability = CONTENT_REGISTRY.byId.ability.get(item.useAbilityId);
  if (!ability?.effectOrBundleId) {
    return fail(actor.id, "unknown item ability");
  }
  if (!consumeItem(save, item.id)) {
    return fail(actor.id, "item not in inventory");
  }
  const events: TickEvent[] = [{ type: "item_used", actorId: actor.id, detail: item.id }];
  applyEffectIds(save, plane, [ability.effectOrBundleId], actor, actor, events);
  return events;
}
