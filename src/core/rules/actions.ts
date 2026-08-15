import { ORTHOGONAL } from "../generation/grid";
import type { MapCoordinate } from "../model/plane";
import type { ActorState, IntentionalAction } from "../model/save-state";
import { DIRECTION_DELTA } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { prepareAction, resolveAbilityAction, resolveAttackAction, resolveItemAction } from "./combat";
import { relocateActor } from "./apply-effects";
import { actorsOnPlane, destinationCell, doorRuntimeState, featureAt, featureIsInteractive, featureRuntimeState, setFeatureRuntimeState } from "./occupancy";
import { dropInventoryItem, pickupGroundItem } from "./inventory";
import { applyThrust } from "./space";
import { applyHazardsAt } from "./hazards";
import { collectProgressionSource, progressionRequirementsMet } from "./grants";
import { openDialogue } from "./dialogue";
import { maybeStepOnTransition, tryActivateWorldTransition, tryEdgeCross } from "./transitions";
import type { TickEvent } from "./tick-events";
import { CONTENT_REGISTRY } from "../data/registry";
import { itemQuantity } from "./inventory";

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
    const events: TickEvent[] = [];
    if (!relocateActor(save, plane, actor, dest, events, "step")) {
      return [{ type: "action_failed", actorId: actor.id, detail: "blocked" }];
    }
    events.push({ type: "actor_moved", actorId: actor.id, x: dest.x, y: dest.y });
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
  if (resolved.type === "pickup") {
    return pickupGroundItem(runtime, resolved.targetId);
  }
  if (resolved.type === "drop") {
    if (!resolved.itemId) {
      return [{ type: "action_failed", actorId: actor.id, detail: "missing item" }];
    }
    return dropInventoryItem(runtime, resolved.itemId);
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
  const events: TickEvent[] = [];
  const fireInteractHazards = (cell: MapCoordinate): void => {
    applyHazardsAt(save, plane, actor, "onInteract", events, origin);
    if (cell.x !== origin.x || cell.y !== origin.y) {
      applyHazardsAt(save, plane, actor, "onInteract", events, cell);
    }
  };
  if (chosenActor) {
    fireInteractHazards({ x: chosenActor.x, y: chosenActor.y });
    events.push({ type: "interacted", actorId: actor.id, targetId: chosenActor.id });
    openDialogue(runtime, chosenActor.id, events);
    if (chosenActor.kind === "npc") {
      for (const source of runtime.topology.progressionSources) {
        if (source.sourceType !== "npc_teaching") {
          continue;
        }
        if (source.plane.a !== plane.plane.a || source.plane.b !== plane.plane.b) {
          continue;
        }
        if (!progressionRequirementsMet(save, source.requirements)) {
          continue;
        }
        collectProgressionSource(save, source, events, { x: actor.x, y: actor.y });
      }
    }
    return events;
  }
  if (chosenFeature?.featureId === "transition_fixture") {
    fireInteractHazards(chosenFeature.cell);
    const activated = tryActivateWorldTransition(runtime, actor, chosenFeature.cell, "interact");
    if (activated) {
      events.push(...activated);
      return events;
    }
  }
  if (chosenFeature?.featureId === "safe_anchor") {
    fireInteractHazards(chosenFeature.cell);
    save.player.safeAnchor = { plane: save.plane, x: chosenFeature.cell.x, y: chosenFeature.cell.y };
    actor.hp = actor.maxHp;
    actor.statuses = actor.statuses.filter((instance) => {
      const def = CONTENT_REGISTRY.byId.status.get(instance.id);
      return def?.clearedOnPlayerDeath === false;
    });
    events.push({ type: "interacted", actorId: actor.id, targetId: "safe_anchor", x: chosenFeature.cell.x, y: chosenFeature.cell.y });
    return events;
  }
  if (chosenFeature?.featureId === "door") {
    const current = doorRuntimeState(save, plane, chosenFeature.cell);
    if (current === "locked") {
      const hasKey = save.player.keyItems.some((row) => row.quantity > 0) || itemQuantity(save, "house_key") > 0;
      if (!hasKey) {
        return [{ type: "action_failed", actorId: actor.id, detail: "door locked" }];
      }
      fireInteractHazards(chosenFeature.cell);
      setFeatureRuntimeState(save, plane.plane, chosenFeature.cell, "open");
      events.push({ type: "door_toggled", actorId: actor.id, targetId: "door", detail: "open", x: chosenFeature.cell.x, y: chosenFeature.cell.y });
      return events;
    }
    fireInteractHazards(chosenFeature.cell);
    const next = current === "open" ? "closed" : "open";
    setFeatureRuntimeState(save, plane.plane, chosenFeature.cell, next);
    events.push({ type: "door_toggled", actorId: actor.id, targetId: "door", detail: next, x: chosenFeature.cell.x, y: chosenFeature.cell.y });
    return events;
  }
  if (chosenFeature && CONTENT_REGISTRY.byId.feature.get(chosenFeature.featureId)?.tags.includes("container")) {
    const opened = featureRuntimeState(save, plane.plane, chosenFeature.cell);
    if (opened === "open") {
      return [{ type: "action_failed", actorId: actor.id, detail: "already opened" }];
    }
    fireInteractHazards(chosenFeature.cell);
    const source = runtime.topology.progressionSources.find((row) => {
      const point = plane.namedPoints.find((named) => named.id === row.id);
      return point !== undefined && point.x === chosenFeature.cell.x && point.y === chosenFeature.cell.y;
    });
    events.push({ type: "interacted", actorId: actor.id, targetId: chosenFeature.featureId, x: chosenFeature.cell.x, y: chosenFeature.cell.y });
    if (source) {
      collectProgressionSource(save, source, events, chosenFeature.cell);
    }
    setFeatureRuntimeState(save, plane.plane, chosenFeature.cell, "open");
    return events;
  }
  if (chosenFeature) {
    fireInteractHazards(chosenFeature.cell);
    events.push({ type: "interacted", actorId: actor.id, targetId: chosenFeature.featureId, x: chosenFeature.cell.x, y: chosenFeature.cell.y });
    return events;
  }
  if (actor.kind === "player") {
    const pickup = pickupGroundItem(runtime, targetId);
    if (!pickup.some((event) => event.type === "action_failed")) {
      fireInteractHazards(origin);
      events.push(...pickup);
      return events;
    }
  }
  return [{ type: "action_failed", actorId: actor.id, detail: "no interactable" }];
}
