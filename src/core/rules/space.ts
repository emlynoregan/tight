import { GLOBAL_CONSTANTS } from "../model/constants";
import type { PlaneBase } from "../generation/plane-types";
import type { MapCoordinate } from "../model/plane";
import type { ActorState, Direction, SaveState } from "../model/save-state";
import { DIRECTION_DELTA } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { relocateActor } from "./apply-effects";
import { canOccupy, destinationCell } from "./occupancy";
import type { TickEvent } from "./tick-events";
import { maybeStepOnTransition } from "./transitions";

export function spacePhysicsActive(family: string): boolean {
  return family === "space";
}

export function clampVelocityComponent(value: number): number {
  return Math.max(
    GLOBAL_CONSTANTS.spaceVelocityComponentMin,
    Math.min(GLOBAL_CONSTANTS.spaceVelocityComponentMax, value),
  );
}

export function thrustVelocity(vx: number, vy: number, direction: Direction): { vx: number; vy: number } {
  const delta = DIRECTION_DELTA[direction];
  return {
    vx: clampVelocityComponent(vx + delta.x),
    vy: clampVelocityComponent(vy + delta.y),
  };
}

export function applyThrust(actor: ActorState, direction: Direction): void {
  const next = thrustVelocity(actor.vx, actor.vy, direction);
  actor.vx = next.vx;
  actor.vy = next.vy;
}

export interface VelocityStepResult {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly blocked: boolean;
}

export function simulateVelocityMovement(
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
  vx: number,
  vy: number,
  save?: SaveState,
): VelocityStepResult {
  let x = mover.x;
  let y = mover.y;
  let remainingX = vx;
  let remainingY = vy;
  while (remainingX !== 0 || remainingY !== 0) {
    if (remainingX !== 0) {
      const step = remainingX > 0 ? 1 : -1;
      const dest = destinationCell({ x, y }, { x: step, y: 0 }, plane.wraps);
      if (!dest || !canOccupy(plane, actors, dest, mover.id, save)) {
        return { x, y, vx: 0, vy: 0, blocked: true };
      }
      x = dest.x;
      y = dest.y;
      remainingX -= step;
    }
    if (remainingY !== 0) {
      const step = remainingY > 0 ? 1 : -1;
      const dest = destinationCell({ x, y }, { x: 0, y: step }, plane.wraps);
      if (!dest || !canOccupy(plane, actors, dest, mover.id, save)) {
        return { x, y, vx: 0, vy: 0, blocked: true };
      }
      x = dest.x;
      y = dest.y;
      remainingY -= step;
    }
  }
  return { x, y, vx, vy, blocked: false };
}

export function landingAfterThrust(
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
  direction: Direction,
  save?: SaveState,
): MapCoordinate {
  const next = thrustVelocity(mover.vx, mover.vy, direction);
  const landed = simulateVelocityMovement(plane, actors, mover, next.vx, next.vy, save);
  return { x: landed.x, y: landed.y };
}

export function applyEnvironmentalMovement(
  runtime: GameRuntime,
  order: readonly { actorId: string }[],
  events: TickEvent[],
): void {
  const save = runtime.save;
  const plane = runtime.currentPlaneBase;
  if (!spacePhysicsActive(save.family)) {
    return;
  }
  for (const entry of order) {
    const actor = save.actors.find((row) => row.id === entry.actorId);
    if (!actor || (actor.vx === 0 && actor.vy === 0)) {
      continue;
    }
    let remainingX = actor.vx;
    let remainingY = actor.vy;
    let moved = false;
    let blocked = false;
    while (remainingX !== 0 || remainingY !== 0) {
      if (remainingX !== 0) {
        const step = remainingX > 0 ? 1 : -1;
        const dest = destinationCell(actor, { x: step, y: 0 }, plane.wraps);
        if (!dest || !relocateActor(save, plane, actor, dest, events, "step")) {
          blocked = true;
          break;
        }
        remainingX -= step;
        moved = true;
        events.push({ type: "actor_moved", actorId: actor.id, x: dest.x, y: dest.y });
      }
      if (remainingY !== 0) {
        const step = remainingY > 0 ? 1 : -1;
        const dest = destinationCell(actor, { x: 0, y: step }, plane.wraps);
        if (!dest || !relocateActor(save, plane, actor, dest, events, "step")) {
          blocked = true;
          break;
        }
        remainingY -= step;
        moved = true;
        events.push({ type: "actor_moved", actorId: actor.id, x: dest.x, y: dest.y });
      }
    }
    if (blocked) {
      actor.vx = 0;
      actor.vy = 0;
      events.push({ type: "velocity_stopped", actorId: actor.id });
    }
    if (moved) {
      events.push(...maybeStepOnTransition(runtime, actor, false));
    }
  }
}
