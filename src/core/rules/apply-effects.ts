import { CONTENT_REGISTRY } from "../data/registry";
import { chebyshev } from "../generation/grid";
import { compareStableIds } from "../generation/semantic-random";
import type { PlaneBase } from "../generation/plane-types";
import type { AtomicEffect } from "../model/content-types";
import type { MapCoordinate } from "../model/plane";
import { planesEqual } from "../model/plane";
import type { ActorState, Direction, SaveState, StatusInstance } from "../model/save-state";
import { actorIsHidden, syncDerivedMaxHp } from "./actor-stats";
import {
  applyHeal,
  applyHpDamage,
  applyStaticEffect,
  applyStatus,
  expandEffectIds,
  removeStatus,
} from "./effect-core";
import { applyHazardsAt } from "./hazards";
import { canOccupy, destinationCell } from "./occupancy";
import type { TickEvent } from "./tick-events";

export type { TickEvent } from "./tick-events";
export { applyHeal, applyHpDamage, applyStatus, expandEffectIds, removeStatus };

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

export function breakHiddenOnHostile(actor: ActorState, events: TickEvent[]): void {
  for (const instance of [...actor.statuses]) {
    const def = CONTENT_REGISTRY.byId.status.get(instance.id);
    if (def?.breaksOnHostileAction) {
      removeStatus(actor, instance.id, events);
    }
  }
}

export function relocateActor(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  dest: MapCoordinate,
  events: TickEvent[],
  mode: "step" | "teleport",
): boolean {
  if (actor.x === dest.x && actor.y === dest.y) {
    return true;
  }
  if (!canOccupy(plane, save.actors, dest, actor.id, save)) {
    return false;
  }
  applyHazardsAt(save, plane, actor, "onLeave", events);
  actor.x = dest.x;
  actor.y = dest.y;
  applyHazardsAt(save, plane, actor, "onEnter", events);
  void mode;
  return true;
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
    if (!relocateActor(save, plane, mover, dest, events, "step")) {
      events.push({ type: "forced_move_blocked", actorId: mover.id, x: mover.x, y: mover.y });
      return;
    }
    events.push({ type: "forced_moved", actorId: mover.id, x: dest.x, y: dest.y });
  }
}

export function teleportWithinPlane(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  dest: MapCoordinate,
  range: number,
  events: TickEvent[],
): boolean {
  if (chebyshev(actor, dest) > range) {
    events.push({ type: "action_failed", actorId: actor.id, detail: "teleport range" });
    return false;
  }
  if (!canOccupy(plane, save.actors, dest, actor.id, save)) {
    events.push({ type: "action_failed", actorId: actor.id, detail: "teleport blocked" });
    return false;
  }
  if (!relocateActor(save, plane, actor, dest, events, "teleport")) {
    events.push({ type: "action_failed", actorId: actor.id, detail: "teleport blocked" });
    return false;
  }
  events.push({ type: "teleported", actorId: actor.id, x: dest.x, y: dest.y });
  return true;
}

export function applyAtomicEffect(
  save: SaveState,
  plane: PlaneBase,
  effect: AtomicEffect,
  target: ActorState,
  source: ActorState | null,
  events: TickEvent[],
  destination?: MapCoordinate,
): void {
  if (applyStaticEffect(save, effect, target, source, events)) {
    return;
  }
  if (effect.kind === "forcedMove") {
    if (source) {
      forcedMove(save, plane, target, source, effect.amount ?? 1, effect.moveMode ?? "push", events);
    }
    return;
  }
  if (effect.kind === "teleportWithinPlane") {
    if (destination) {
      teleportWithinPlane(save, plane, target, destination, effect.amount ?? 0, events);
    } else {
      events.push({ type: "action_failed", actorId: target.id, detail: "teleport destination" });
    }
    return;
  }
  if (effect.kind === "clearVelocity") {
    if (target.vx !== 0 || target.vy !== 0) {
      events.push({ type: "velocity_cleared", actorId: target.id });
    }
    target.vx = 0;
    target.vy = 0;
    return;
  }
  if (effect.kind === "revealTiles") {
    const radius = effect.amount ?? 0;
    const duration = effect.durationTicks ?? 10;
    target.revealBonusRadius = Math.max(target.revealBonusRadius, radius);
    target.revealRemainingTicks = Math.max(target.revealRemainingTicks, duration);
    events.push({ type: "tiles_revealed", actorId: target.id, amount: radius });
    return;
  }
  if (effect.kind === "extraActionOnce") {
    target.pendingExtraActions += 1;
    events.push({ type: "extra_action_granted", actorId: target.id });
  }
}

export function applyEffectIds(
  save: SaveState,
  plane: PlaneBase,
  ids: readonly string[],
  target: ActorState,
  source: ActorState | null,
  events: TickEvent[],
  destination?: MapCoordinate,
): void {
  for (const id of ids) {
    for (const effect of expandEffectIds(id)) {
      applyAtomicEffect(save, plane, effect, target, source, events, destination);
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
    if (actor.revealRemainingTicks > 0) {
      actor.revealRemainingTicks -= 1;
      if (actor.revealRemainingTicks <= 0) {
        actor.revealBonusRadius = 0;
        actor.revealRemainingTicks = 0;
      }
    }
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
