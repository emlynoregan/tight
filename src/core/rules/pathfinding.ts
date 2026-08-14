import { CONTENT_REGISTRY } from "../data/registry";
import { cellKey, ORTHOGONAL } from "../generation/grid";
import type { PlaneBase } from "../generation/plane-types";
import { compareCoordinates, type MapCoordinate } from "../model/plane";
import { directionFromDelta, type ActorState, type Direction } from "../model/save-state";
import { canOccupy, destinationCell, featureAt } from "./occupancy";

function actorUsesDoors(actor: ActorState): boolean {
  if (actor.kind === "player") {
    return true;
  }
  return CONTENT_REGISTRY.byId.monster.get(actor.definitionId)?.traits.includes("door_user") === true;
}

export function pathCellAllowed(
  plane: PlaneBase,
  actors: readonly ActorState[],
  cell: MapCoordinate,
  mover: ActorState,
): boolean {
  if (!canOccupy(plane, actors, cell, mover.id)) {
    return false;
  }
  if (featureAt(plane, cell) === "door" && !actorUsesDoors(mover)) {
    return false;
  }
  return true;
}

export function legalMoveDirections(
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
): Direction[] {
  const directions: Direction[] = [];
  for (const delta of ORTHOGONAL) {
    const dest = destinationCell(mover, delta, plane.wraps);
    const direction = directionFromDelta(delta);
    if (!dest || !direction || !pathCellAllowed(plane, actors, dest, mover)) {
      continue;
    }
    directions.push(direction);
  }
  return directions;
}

interface ReachableCell {
  readonly cell: MapCoordinate;
  readonly cost: number;
  readonly firstStep: Direction | null;
}

function reachableFrom(
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
): Map<string, ReachableCell> {
  const origin: ReachableCell = { cell: { x: mover.x, y: mover.y }, cost: 0, firstStep: null };
  const best = new Map<string, ReachableCell>([[cellKey(origin.cell), origin]]);
  const queue: ReachableCell[] = [origin];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head]!;
    head += 1;
    for (const delta of ORTHOGONAL) {
      const dest = destinationCell(current.cell, delta, plane.wraps);
      const direction = directionFromDelta(delta);
      if (!dest || !direction || !pathCellAllowed(plane, actors, dest, mover)) {
        continue;
      }
      const key = cellKey(dest);
      if (best.has(key)) {
        continue;
      }
      const next: ReachableCell = {
        cell: dest,
        cost: current.cost + 1,
        firstStep: current.firstStep ?? direction,
      };
      best.set(key, next);
      queue.push(next);
    }
  }
  return best;
}

export function shortestPathFirstStep(
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
  goals: readonly MapCoordinate[],
): Direction | null {
  const reached = reachableFrom(plane, actors, mover);
  const matches = goals
    .map((goal) => reached.get(cellKey(goal)))
    .filter((node): node is ReachableCell => node !== undefined)
    .sort((left, right) => {
      if (left.cost !== right.cost) {
        return left.cost - right.cost;
      }
      return compareCoordinates(left.cell, right.cell);
    });
  return matches[0]?.firstStep ?? null;
}

export function nearestReachable(
  plane: PlaneBase,
  actors: readonly ActorState[],
  mover: ActorState,
  predicate: (cell: MapCoordinate) => boolean,
): MapCoordinate | null {
  const reached = [...reachableFrom(plane, actors, mover).values()].filter((node) => predicate(node.cell));
  reached.sort((left, right) => {
    if (left.cost !== right.cost) {
      return left.cost - right.cost;
    }
    return compareCoordinates(left.cell, right.cell);
  });
  return reached[0]?.cell ?? null;
}
