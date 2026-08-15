import { CONTENT_REGISTRY } from "../data/registry";
import { compareStableIds } from "../generation/semantic-random";
import type { PlaneBase } from "../generation/plane-types";
import type { AtomicEffect } from "../model/content-types";
import type { ActorState, SaveState, StatusInstance } from "../model/save-state";
import { flatArmour, resistanceFor } from "./actor-stats";
import { resolveFlatDamage } from "./combat-math";
import type { TickEvent } from "./tick-events";

export function applyHeal(actor: ActorState, amount: number, events: TickEvent[]): void {
  const before = actor.hp;
  actor.hp = Math.min(actor.maxHp, actor.hp + amount);
  if (actor.hp !== before) {
    events.push({ type: "healed", actorId: actor.id, amount: actor.hp - before });
  }
}

export function applyHpDamage(actor: ActorState, amount: number, events: TickEvent[], damageType?: string): void {
  if (amount <= 0) {
    return;
  }
  actor.hp -= amount;
  events.push(
    damageType
      ? { type: "damage_taken", actorId: actor.id, amount, detail: damageType }
      : { type: "damage_taken", actorId: actor.id, amount },
  );
}

export function applyStatus(
  actor: ActorState,
  statusId: string,
  sourceId: string | null,
  events: TickEvent[],
): void {
  const def = CONTENT_REGISTRY.byId.status.get(statusId);
  if (!def) {
    return;
  }
  for (const instance of actor.statuses) {
    const existing = CONTENT_REGISTRY.byId.status.get(instance.id);
    if (existing?.immuneToStatusIds.includes(statusId)) {
      return;
    }
  }
  const found = actor.statuses.find((row) => row.id === statusId);
  if (found) {
    found.remainingTicks = def.durationTicks;
    found.sourceId = sourceId ?? found.sourceId;
    events.push(
      sourceId
        ? { type: "status_applied", actorId: actor.id, detail: statusId, targetId: sourceId }
        : { type: "status_applied", actorId: actor.id, detail: statusId },
    );
    return;
  }
  const instance: StatusInstance = {
    id: statusId,
    remainingTicks: def.durationTicks,
    sourceId,
  };
  actor.statuses.push(instance);
  actor.statuses.sort((left, right) => compareStableIds(left.id, right.id));
  events.push(
    sourceId
      ? { type: "status_applied", actorId: actor.id, detail: statusId, targetId: sourceId }
      : { type: "status_applied", actorId: actor.id, detail: statusId },
  );
}

export function removeStatus(actor: ActorState, statusId: string, events: TickEvent[]): void {
  const before = actor.statuses.length;
  actor.statuses = actor.statuses.filter((row) => row.id !== statusId);
  if (actor.statuses.length !== before) {
    events.push({ type: "status_removed", actorId: actor.id, detail: statusId });
  }
}

export function expandEffectIds(id: string): AtomicEffect[] {
  const atomic = CONTENT_REGISTRY.byId.effect.get(id);
  if (atomic) {
    return [atomic];
  }
  const bundle = CONTENT_REGISTRY.byId.bundle.get(id);
  if (!bundle) {
    return [];
  }
  return bundle.effectIds.flatMap((effectId) => {
    const row = CONTENT_REGISTRY.byId.effect.get(effectId);
    return row ? [row] : [];
  });
}

export function applyStaticEffect(
  save: SaveState,
  effect: AtomicEffect,
  target: ActorState,
  source: ActorState | null,
  events: TickEvent[],
): boolean {
  switch (effect.kind) {
    case "heal":
      applyHeal(target, effect.amount ?? 0, events);
      return true;
    case "damage": {
      const damageType = effect.damageType ?? "physical";
      const amount = resolveFlatDamage(
        effect.amount ?? 0,
        resistanceFor(save, target, damageType),
        flatArmour(save, target, damageType),
      );
      applyHpDamage(target, amount, events, damageType);
      if (source?.kind === "player") {
        target.lastAffectedTick = save.tick;
      }
      return true;
    }
    case "applyStatus":
      if (effect.statusId) {
        applyStatus(target, effect.statusId, source?.id ?? null, events);
      }
      return true;
    case "removeStatus":
      if (effect.statusId) {
        removeStatus(target, effect.statusId, events);
      }
      return true;
    default:
      return false;
  }
}

export function applyStaticEffectIds(
  save: SaveState,
  plane: PlaneBase,
  ids: readonly string[],
  target: ActorState,
  source: ActorState | null,
  events: TickEvent[],
): void {
  void plane;
  for (const id of ids) {
    for (const effect of expandEffectIds(id)) {
      applyStaticEffect(save, effect, target, source, events);
    }
  }
}
