import { compareStableIds } from "../generation/semantic-random";
import { planesEqual } from "../model/plane";
import type { ActorState } from "../model/save-state";
import { CONTENT_REGISTRY } from "../data/registry";
import type { GameRuntime } from "../runtime/game-runtime";
import { addWorldFlag } from "./grants";
import { applyMonsterDeathRewards } from "./rewards";
import type { TickEvent } from "./tick-events";
import { switchCurrentPlane } from "./transitions";

function statusClearedOnDeath(statusId: string): boolean {
  const field = CONTENT_REGISTRY.deathRules.statusClearField;
  return CONTENT_REGISTRY.byId.status.get(statusId)?.[field] !== false;
}

function isFinalBoss(actor: ActorState): boolean {
  const victory = CONTENT_REGISTRY.victory;
  return actor.definitionId === victory.bossId || actor.id === victory.actorId;
}

function cancelPursuitsInvolvingPlayer(runtime: GameRuntime, events: TickEvent[]): void {
  const rules = CONTENT_REGISTRY.deathRules;
  if (!rules.cancelPursuitsInvolvingPlayer) {
    return;
  }
  for (const handoff of runtime.save.pursuits) {
    events.push({ type: "pursuit_cancelled", actorId: handoff.actorId, targetId: handoff.transitionId });
  }
  runtime.save.pursuits = [];
}

function resolveVictory(runtime: GameRuntime, events: TickEvent[]): void {
  const save = runtime.save;
  const victory = CONTENT_REGISTRY.victory;
  const already = save.flags.includes(victory.flagId);
  addWorldFlag(save, victory.flagId);
  addWorldFlag(save, victory.deadFlagId);
  if (already) {
    return;
  }
  save.modal = victory.modalId;
  events.push({ type: "victory", actorId: victory.actorId, detail: victory.id });
}

export function resolveDeaths(runtime: GameRuntime, events: TickEvent[]): void {
  const save = runtime.save;
  const doomed = save.actors.filter((actor) => actor.hp <= 0).sort((left, right) => compareStableIds(left.id, right.id));
  for (const actor of doomed) {
    if (actor.kind === "player") {
      resolvePlayerDeath(runtime, actor, events);
      continue;
    }
    const finalBoss = isFinalBoss(actor);
    save.actors = save.actors.filter((row) => row.id !== actor.id);
    if (!save.flags.includes(`defeated:${actor.id}`)) {
      save.flags.push(`defeated:${actor.id}`);
    }
    events.push({ type: "monster_died", actorId: actor.id });
    applyMonsterDeathRewards(runtime, actor, events);
    if (finalBoss) {
      resolveVictory(runtime, events);
    }
  }
}

function resolvePlayerDeath(runtime: GameRuntime, actor: ActorState, events: TickEvent[]): void {
  const save = runtime.save;
  const rules = CONTENT_REGISTRY.deathRules;
  events.push({ type: "player_died", actorId: actor.id });
  if (rules.clearActionQueue) {
    save.actionQueue = [];
  }
  if (rules.clearHeldDirection) {
    save.heldDirection = null;
    save.heldDirectionChanged = false;
  }
  if (rules.clearSpaceVelocity) {
    if (actor.vx !== 0 || actor.vy !== 0) {
      events.push({ type: "velocity_cleared", actorId: actor.id });
    }
    actor.vx = 0;
    actor.vy = 0;
  }
  if (rules.clearPendingExtraActions) {
    actor.pendingExtraActions = 0;
  }
  if (rules.clearRevealBonus) {
    actor.revealBonusRadius = 0;
    actor.revealRemainingTicks = 0;
  }
  if (rules.clearPendingTransition) {
    runtime.pendingPlayerTransition = null;
  }
  cancelPursuitsInvolvingPlayer(runtime, events);
  actor.statuses = actor.statuses.filter((instance) => {
    if (statusClearedOnDeath(instance.id)) {
      events.push({ type: "status_removed", actorId: actor.id, detail: instance.id });
      return false;
    }
    return true;
  });
  if (rules.clearCooldowns) {
    actor.cooldowns = [];
  }
  const anchor = save.player.safeAnchor;
  actor.plane = { ...anchor.plane };
  actor.x = anchor.x;
  actor.y = anchor.y;
  if (rules.restoreHpToMax) {
    actor.hp = actor.maxHp;
  }
  if (!planesEqual(runtime.currentPlaneBase.plane, anchor.plane)) {
    switchCurrentPlane(runtime, anchor.plane);
  } else {
    save.plane = { ...anchor.plane };
  }
  events.push({ type: "player_respawned", actorId: actor.id, x: actor.x, y: actor.y });
}
