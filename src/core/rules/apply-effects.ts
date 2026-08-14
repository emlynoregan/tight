import { CONTENT_REGISTRY } from "../data/registry";
import { compareStableIds } from "../generation/semantic-random";
import type { PlaneBase } from "../generation/plane-types";
import type { AtomicEffect } from "../model/content-types";
import type { MapCoordinate } from "../model/plane";
import { planesEqual } from "../model/plane";
import type { ActorState, Direction, SaveState, StatusInstance } from "../model/save-state";
import { actorIsHidden, flatArmour, resistanceFor, syncDerivedMaxHp } from "./actor-stats";
import { resolveFlatDamage } from "./combat-math";
import { canOccupy, destinationCell } from "./occupancy";
import type { TickEvent } from "./tick-events";

export type { TickEvent } from "./tick-events";

function orthogonalDelta(from: MapCoordinate, source: MapCoordinate, mode: "push" | "pull"): MapCoordinate | null {
  const dx = mode === "push" ? from.x - source.x : source.x - from.x;
  const dy = mode === "push" ? from.y - source.y : source.y - from.y;
  if (dx === 0 && dy === 0) {
    return null;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: Math.sign(dx), y: 0 };
  }
  return { x: 0, y: Math.sign(dy) };
}

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

export function breakHiddenOnHostile(actor: ActorState, events: TickEvent[]): void {
  for (const instance of [...actor.statuses]) {
    const def = CONTENT_REGISTRY.byId.status.get(instance.id);
    if (def?.breaksOnHostileAction) {
      removeStatus(actor, instance.id, events);
    }
  }
}

export function forcedMove(
  save: SaveState,
  plane: PlaneBase,
  mover: ActorState,
  source: MapCoordinate,
  distance: number,
  mode: "push" | "pull",
  events: TickEvent[],
): void {
  for (let step = 0; step < distance; step += 1) {
    const delta = orthogonalDelta(mover, source, mode);
    if (!delta) {
      return;
    }
    const dest = destinationCell(mover, delta, plane.wraps);
    if (!dest || !canOccupy(plane, save.actors, dest, mover.id, save)) {
      events.push({ type: "forced_move_blocked", actorId: mover.id, x: mover.x, y: mover.y });
      return;
    }
    mover.x = dest.x;
    mover.y = dest.y;
    events.push({ type: "forced_moved", actorId: mover.id, x: dest.x, y: dest.y });
  }
}

export function applyAtomicEffect(
  save: SaveState,
  plane: PlaneBase,
  effect: AtomicEffect,
  target: ActorState,
  source: ActorState | null,
  events: TickEvent[],
): void {
  switch (effect.kind) {
    case "heal":
      applyHeal(target, effect.amount ?? 0, events);
      return;
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
      return;
    }
    case "applyStatus":
      if (effect.statusId) {
        applyStatus(target, effect.statusId, source?.id ?? null, events);
      }
      return;
    case "removeStatus":
      if (effect.statusId) {
        removeStatus(target, effect.statusId, events);
      }
      return;
    case "forcedMove":
      if (source) {
        forcedMove(save, plane, target, source, effect.amount ?? 1, effect.moveMode ?? "push", events);
      }
      return;
    case "teleportWithinPlane":
    case "clearVelocity":
    case "revealTiles":
    case "extraActionOnce":
      events.push({ type: "effect_deferred", actorId: target.id, detail: effect.kind });
      return;
    default:
      return;
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

export function applyEffectIds(
  save: SaveState,
  plane: PlaneBase,
  ids: readonly string[],
  target: ActorState,
  source: ActorState | null,
  events: TickEvent[],
): void {
  for (const id of ids) {
    for (const effect of expandEffectIds(id)) {
      applyAtomicEffect(save, plane, effect, target, source, events);
    }
  }
}

export function applyPeriodicStatuses(save: SaveState, plane: PlaneBase, events: TickEvent[]): void {
  const actors = [...save.actors]
    .filter((actor) => planesEqual(actor.plane, plane.plane))
    .sort((left, right) => compareStableIds(left.id, right.id));
  for (const actor of actors) {
    syncDerivedMaxHp(save, actor);
    for (const instance of [...actor.statuses].sort((left, right) => compareStableIds(left.id, right.id))) {
      const def = CONTENT_REGISTRY.byId.status.get(instance.id);
      if (!def?.periodicEffectId) {
        continue;
      }
      applyEffectIds(save, plane, [def.periodicEffectId], actor, null, events);
    }
  }
}

export function expireStatusesAndCooldowns(save: SaveState, events: TickEvent[]): void {
  for (const actor of save.actors) {
    if (!planesEqual(actor.plane, save.plane)) {
      continue;
    }
    const kept: StatusInstance[] = [];
    for (const instance of actor.statuses) {
      if (instance.remainingTicks === "until_broken") {
        kept.push(instance);
        continue;
      }
      instance.remainingTicks -= 1;
      if (instance.remainingTicks > 0) {
        kept.push(instance);
      } else {
        events.push({ type: "status_removed", actorId: actor.id, detail: instance.id });
      }
    }
    actor.statuses = kept;
    const remainingCooldowns = [];
    for (const cooldown of actor.cooldowns) {
      if (cooldown.startedOnTick === save.tick) {
        remainingCooldowns.push(cooldown);
        continue;
      }
      cooldown.remainingTicks -= 1;
      if (cooldown.remainingTicks > 0) {
        remainingCooldowns.push(cooldown);
      }
    }
    actor.cooldowns = remainingCooldowns;
  }
}

export function hiddenIsDetectable(viewer: ActorState, target: ActorState): boolean {
  if (!actorIsHidden(target)) {
    return true;
  }
  return Math.abs(viewer.x - target.x) + Math.abs(viewer.y - target.y) === 1 && (viewer.x === target.x || viewer.y === target.y);
}

export function confuseDirection(direction: Direction, turns: number): Direction {
  const order: Direction[] = ["north", "east", "south", "west"];
  const index = order.indexOf(direction);
  return order[(index + (turns % 4) + 4) % 4]!;
}
