import { ORTHOGONAL } from "../generation/grid";
import type { MapCoordinate } from "../model/plane";
import type { ActorState, IntentionalAction } from "../model/save-state";
import { DIRECTION_DELTA } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { prepareAction, resolveAbilityAction, resolveAttackAction, resolveItemAction } from "./combat";
import { actorsOnPlane, canOccupy, destinationCell, doorRuntimeState, featureAt, featureIsInteractive, setFeatureRuntimeState } from "./occupancy";
import { applyThrust } from "./space";
import { maybeStepOnTransition, tryActivateWorldTransition, tryEdgeCross } from "./transitions";
import type { TickEvent } from "./tick-events";

export type { TickEvent } from "./tick-events";

function adjacentCells(origin: MapCoordinate, wraps: boolean): MapCoordinate[] {
  return ORTHOGONAL.map((delta) => destinationCell(origin, delta, wraps)).filter((cell): cell is MapCoordinate => cell !== null);
}

export function resolveAction(runtime: GameRuntime, actor: ActorState, action: IntentionalAction): TickEvent[] {
  const save = runtime.save;
  const plane = runtime.currentPlaneBase;
  const prepared = prepareAction(save, actor, action);
  if ("failed" in prepared) {
    return [{ type: "action_failed", actorId: actor.id, detail: prepared.failed }];
  }
  const resolved = prepared;
  if (resolved.type === "wait") {
    return [{ type: "action_waited", actorId: actor.id }];
  }
  if (resolved.type === "thrust") {
    if (!resolved.direction) {
      return [{ type: "action_failed", actorId: actor.id, detail: "missing direction" }];
    }
    applyThrust(actor, resolved.direction);
    return [{ type: "thrusted", actorId: actor.id, detail: resolved.direction, x: actor.vx, y: actor.vy }];
  }
  if (resolved.type === "move") {
    if (!resolved.direction) {
      return [{ type: "action_failed", actorId: actor.id, detail: "missing direction" }];
    }
    const dest = destinationCell(actor, DIRECTION_DELTA[resolved.direction], plane.wraps);
    if (!dest) {
      const edge = tryEdgeCross(runtime, actor, resolved.direction);
      if (edge !== null) {
        return edge;
      }
      return [{ type: "action_failed", actorId: actor.id, detail: "blocked" }];
    }
    if (!canOccupy(plane, save.actors, dest, actor.id, save)) {
      return [{ type: "action_failed", actorId: actor.id, detail: "blocked" }];
    }
    actor.x = dest.x;
    actor.y = dest.y;
    const events: TickEvent[] = [{ type: "actor_moved", actorId: actor.id, x: dest.x, y: dest.y }];
    events.push(...maybeStepOnTransition(runtime, actor, true));
    return events;
  }
  if (resolved.type === "interact") {
    return resolveInteract(runtime, actor, resolved);
  }
  if (resolved.type === "attack") {
    return resolveAttackAction(save, plane, actor, resolved, save.family);
  }
  if (resolved.type === "ability") {
    return resolveAbilityAction(save, plane, actor, resolved, save.family);
  }
  if (resolved.type === "item") {
    return resolveItemAction(save, plane, actor, resolved);
  }
  return [{ type: "action_failed", actorId: actor.id, detail: "unknown action" }];
}

function resolveInteract(runtime: GameRuntime, actor: ActorState, action: IntentionalAction): TickEvent[] {
  const save = runtime.save;
  const plane = runtime.currentPlaneBase;
  const origin = { x: actor.x, y: actor.y };
  const neighbours = [origin, ...adjacentCells(origin, plane.wraps)];
  const featureTargets = neighbours
    .map((cell) => ({ cell, featureId: featureAt(plane, cell) }))
    .filter((row): row is { cell: MapCoordinate; featureId: string } => row.featureId !== null && featureIsInteractive(row.featureId));
  const localActors = actorsOnPlane(save.actors, plane.plane);
  const actorTargets = neighbours
    .map((cell) => localActors.find((row) => row.x === cell.x && row.y === cell.y && row.id !== actor.id))
    .filter((row): row is ActorState => row !== undefined && (row.kind === "npc" || row.kind === "guardian"));

  const targetId = action.targetId;
  let chosenFeature = featureTargets[0];
  let chosenActor = actorTargets[0];
  if (targetId) {
    chosenFeature = featureTargets.find((row) => {
      const idMatch =
        row.featureId === targetId ||
        (row.featureId === "transition_fixture" && (targetId === "transition_fixture" || targetId.startsWith("transition.")));
      if (!idMatch) {
        return false;
      }
      if (action.targetX === undefined || action.targetY === undefined) {
        return true;
      }
      return row.cell.x === action.targetX && row.cell.y === action.targetY;
    });
    chosenActor = actorTargets.find((row) => row.id === targetId);
  }
  if (chosenActor) {
    save.modal = `dialogue:${chosenActor.id}`;
    return [
      { type: "interacted", actorId: actor.id, targetId: chosenActor.id },
      { type: "modal_opened", detail: save.modal },
    ];
  }
  if (chosenFeature?.featureId === "transition_fixture") {
    const events = tryActivateWorldTransition(runtime, actor, chosenFeature.cell, "interact");
    if (events) {
      return events;
    }
  }
  if (chosenFeature?.featureId === "safe_anchor") {
    save.player.safeAnchor = { plane: save.plane, x: chosenFeature.cell.x, y: chosenFeature.cell.y };
    actor.hp = actor.maxHp;
    return [{ type: "interacted", actorId: actor.id, targetId: "safe_anchor", x: chosenFeature.cell.x, y: chosenFeature.cell.y }];
  }
  if (chosenFeature?.featureId === "door") {
    const current = doorRuntimeState(save, plane, chosenFeature.cell);
    if (current === "locked") {
      return [{ type: "action_failed", actorId: actor.id, detail: "door locked" }];
    }
    const next = current === "open" ? "closed" : "open";
    setFeatureRuntimeState(save, plane.plane, chosenFeature.cell, next);
    return [{ type: "door_toggled", actorId: actor.id, targetId: "door", detail: next, x: chosenFeature.cell.x, y: chosenFeature.cell.y }];
  }
  if (chosenFeature) {
    return [{ type: "interacted", actorId: actor.id, targetId: chosenFeature.featureId, x: chosenFeature.cell.x, y: chosenFeature.cell.y }];
  }
  return [{ type: "action_failed", actorId: actor.id, detail: "no interactable" }];
}
