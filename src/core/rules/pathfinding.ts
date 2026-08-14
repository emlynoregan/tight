import { CONTENT_REGISTRY } from "../data/registry";
import { cellKey, ORTHOGONAL } from "../generation/grid";
import type { PlaneBase } from "../generation/plane-types";
import { compareCoordinates, type MapCoordinate } from "../model/plane";
import {
  directionFromDelta,
  type ActorState,
  type Direction,
  type IntentionalAction,
  type SaveState,
} from "../model/save-state";
import { actorAt, canOccupy, destinationCell, doorRuntimeState } from "./occupancy";

function actorUsesDoors(actor: ActorState): boolean {
  if (actor.kind === "player") {
    return true;
  }
  return CONTENT_REGISTRY.byId.monster.get(actor.definitionId)?.traits.includes("door_user") === true;
}

function usableClosedDoor(save: SaveState, plane: PlaneBase, cell: MapCoordinate, mover: ActorState): boolean {
  return doorRuntimeState(save, plane, cell) === "closed" && actorUsesDoors(mover) && !actorAt(save.actors, cell, mover.id)?.blocking;
}

export function pathCellAllowed(
  plane: PlaneBase,
  actors: readonly ActorState[],
  cell: MapCoordinate,
  mover: ActorState,
  save: SaveState,
): boolean {
  return canOccupy(plane, actors, cell, mover.id, save);
}

export function legalMoveDirections(
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
  save: SaveState,
): Direction[] {
  const directions: Direction[] = [];
  for (const delta of ORTHOGONAL) {
    const dest = destinationCell(mover, delta, plane.wraps);
    const direction = directionFromDelta(delta);
    if (!dest || !direction || !canOccupy(plane, actors, dest, mover.id, save)) {
      continue;
    }
    directions.push(direction);
  }
  return directions;
}

interface ReachableCell {
  readonly cell: MapCoordinate;
  readonly cost: number;
  readonly firstAction: IntentionalAction | null;
}

function compareReachable(left: ReachableCell, right: ReachableCell): number {
  if (left.cost !== right.cost) {
    return left.cost - right.cost;
  }
  return compareCoordinates(left.cell, right.cell);
}

function neighbourEdge(
  save: SaveState,
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
  dest: MapCoordinate,
  direction: Direction,
): { cost: number; action: IntentionalAction } | null {
  if (usableClosedDoor(save, plane, dest, mover)) {
    return { cost: 2, action: { type: "interact", targetId: "door", targetX: dest.x, targetY: dest.y } };
  }
  if (!canOccupy(plane, actors, dest, mover.id, save)) {
    return null;
  }
  return { cost: 1, action: { type: "move", direction } };
}

function reachableFrom(
  plane: PlaneBase,
  save: SaveState,
  actors: readonly ActorState[],
  mover: ActorState,
): Map<string, ReachableCell> {
  const origin: ReachableCell = { cell: { x: mover.x, y: mover.y }, cost: 0, firstAction: null };
  const best = new Map<string, ReachableCell>([[cellKey(origin.cell), origin]]);
  const pending: ReachableCell[] = [origin];
  const settled = new Set<string>();
  while (pending.length > 0) {
    pending.sort(compareReachable);
    const current = pending.shift()!;
    const key = cellKey(current.cell);
    if (settled.has(key)) {
      continue;
    }
    settled.add(key);
    for (const delta of ORTHOGONAL) {
      const dest = destinationCell(current.cell, delta, plane.wraps);
      const direction = directionFromDelta(delta);
      if (!dest || !direction) {
        continue;
      }
      const edge = neighbourEdge(save, plane, actors, mover, dest, direction);
      if (!edge) {
        continue;
      }
      const next: ReachableCell = {
        cell: dest,
        cost: current.cost + edge.cost,
        firstAction: current.firstAction ?? edge.action,
      };
      const destKey = cellKey(dest);
      const existing = best.get(destKey);
      if (existing && compareReachable(existing, next) <= 0) {
        continue;
      }
      best.set(destKey, next);
      pending.push(next);
    }
  }
  return best;
}

export function shortestPathFirstAction(
  plane: PlaneBase,
  save: SaveState,
  actors: readonly ActorState[],
  mover: ActorState,
  goals: readonly MapCoordinate[],
): IntentionalAction | null {
  const reached = reachableFrom(plane, save, actors, mover);
  const matches = goals
    .map((goal) => reached.get(cellKey(goal)))
    .filter((node): node is ReachableCell => node !== undefined)
    .sort(compareReachable);
  return matches[0]?.firstAction ?? null;
}

export function shortestPathFirstStep(
  plane: PlaneBase,
  save: SaveState,
  actors: readonly ActorState[],
  mover: ActorState,
  goals: readonly MapCoordinate[],
): Direction | null {
  const action = shortestPathFirstAction(plane, save, actors, mover, goals);
  return action?.type === "move" && action.direction ? action.direction : null;
}

export function nearestReachable(
  plane: PlaneBase,
  save: SaveState,
  actors: readonly ActorState[],
  mover: ActorState,
  predicate: (cell: MapCoordinate) => boolean,
): MapCoordinate | null {
  const reached = [...reachableFrom(plane, save, actors, mover).values()].filter((node) => predicate(node.cell));
  reached.sort(compareReachable);
  return reached[0]?.cell ?? null;
}

export function movementCostTo(
  plane: PlaneBase,
  save: SaveState,
  actors: readonly ActorState[],
  mover: ActorState,
  goal: MapCoordinate,
): number | null {
  return reachableFrom(plane, save, actors, mover).get(cellKey(goal))?.cost ?? null;
}
