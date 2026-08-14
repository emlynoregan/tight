import { ORTHOGONAL } from "../generation/grid";
import type { PlaneBase } from "../generation/plane-types";
import type { MapCoordinate } from "../model/plane";
import type { ActorState, IntentionalAction, SaveState } from "../model/save-state";
import { DIRECTION_DELTA } from "../model/save-state";
import { prepareAction, resolveAbilityAction, resolveAttackAction, resolveItemAction } from "./combat";
import { canOccupy, destinationCell, featureAt, featureIsInteractive } from "./occupancy";
import { applyThrust } from "./space";
import type { TickEvent } from "./tick-events";

export type { TickEvent } from "./tick-events";

function adjacentCells(origin: MapCoordinate, wraps: boolean): MapCoordinate[] {
  return ORTHOGONAL.map((delta) => destinationCell(origin, delta, wraps)).filter((cell): cell is MapCoordinate => cell !== null);
}

export function resolveAction(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  action: IntentionalAction,
): TickEvent[] {
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
    if (!dest || !canOccupy(plane, save.actors, dest, actor.id)) {
      return [{ type: "action_failed", actorId: actor.id, detail: "blocked" }];
    }
    actor.x = dest.x;
    actor.y = dest.y;
    return [{ type: "actor_moved", actorId: actor.id, x: dest.x, y: dest.y }];
  }
  if (resolved.type === "interact") {
    return resolveInteract(save, plane, actor, resolved.targetId);
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

function resolveInteract(save: SaveState, plane: PlaneBase, actor: ActorState, targetId: string | undefined): TickEvent[] {
  const origin = { x: actor.x, y: actor.y };
  const neighbours = adjacentCells(origin, plane.wraps);
  const featureTargets = neighbours
    .map((cell) => ({ cell, featureId: featureAt(plane, cell) }))
    .filter((row): row is { cell: MapCoordinate; featureId: string } => row.featureId !== null && featureIsInteractive(row.featureId));
  const actorTargets = neighbours
    .map((cell) => save.actors.find((row) => row.x === cell.x && row.y === cell.y && row.id !== actor.id))
    .filter((row): row is ActorState => row !== undefined && (row.kind === "npc" || row.kind === "guardian"));

  let chosenFeature = featureTargets[0];
  let chosenActor = actorTargets[0];
  if (targetId) {
    chosenFeature = featureTargets.find((row) => row.featureId === targetId);
    chosenActor = actorTargets.find((row) => row.id === targetId);
  }
  if (chosenActor) {
    save.modal = `dialogue:${chosenActor.id}`;
    return [
      { type: "interacted", actorId: actor.id, targetId: chosenActor.id },
      { type: "modal_opened", detail: save.modal },
    ];
  }
  if (chosenFeature?.featureId === "safe_anchor") {
    save.player.safeAnchor = { plane: save.plane, x: chosenFeature.cell.x, y: chosenFeature.cell.y };
    actor.hp = actor.maxHp;
    return [{ type: "interacted", actorId: actor.id, targetId: "safe_anchor", x: chosenFeature.cell.x, y: chosenFeature.cell.y }];
  }
  if (chosenFeature) {
    return [{ type: "interacted", actorId: actor.id, targetId: chosenFeature.featureId, x: chosenFeature.cell.x, y: chosenFeature.cell.y }];
  }
  return [{ type: "action_failed", actorId: actor.id, detail: "no interactable" }];
}
