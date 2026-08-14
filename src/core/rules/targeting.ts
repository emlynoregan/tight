import { chebyshev, manhattan, ORTHOGONAL } from "../generation/grid";
import type { AttackDefinition } from "../model/content-types";
import type { MapCoordinate } from "../model/plane";
import type { ActorState } from "../model/save-state";
import { destinationCell } from "./occupancy";

export function orthogonalAdjacent(origin: MapCoordinate, wraps: boolean): MapCoordinate[] {
  return ORTHOGONAL.map((delta) => destinationCell(origin, delta, wraps)).filter(
    (cell): cell is MapCoordinate => cell !== null,
  );
}

export function attackRangeDistance(from: MapCoordinate, to: MapCoordinate): number {
  return manhattan(from, to);
}

export function lineCellsToward(
  origin: MapCoordinate,
  target: MapCoordinate,
  range: number,
  wraps: boolean,
): MapCoordinate[] | null {
  const dx = Math.sign(target.x - origin.x);
  const dy = Math.sign(target.y - origin.y);
  if (dx !== 0 && dy !== 0) {
    return null;
  }
  if (dx === 0 && dy === 0) {
    return [];
  }
  const cells: MapCoordinate[] = [];
  let current = origin;
  for (let step = 0; step < range; step += 1) {
    const next = destinationCell(current, { x: dx, y: dy }, wraps);
    if (!next) {
      break;
    }
    cells.push(next);
    current = next;
    if (next.x === target.x && next.y === target.y) {
      break;
    }
  }
  return cells;
}

export function shapeCells(
  attack: AttackDefinition,
  origin: MapCoordinate,
  aim: MapCoordinate,
  wraps: boolean,
): MapCoordinate[] {
  switch (attack.shape) {
    case "adjacent":
      return orthogonalAdjacent(origin, wraps);
    case "single":
      return [aim];
    case "line":
      return lineCellsToward(origin, aim, attack.range, wraps) ?? [];
    case "cross1": {
      const centre = attack.range === 0 ? origin : aim;
      return [centre, ...orthogonalAdjacent(centre, wraps)];
    }
    case "radius1":
    case "radius2": {
      const centre = attack.range === 0 ? origin : aim;
      const radius = attack.shape === "radius1" ? 1 : 2;
      const cells: MapCoordinate[] = [];
      for (let y = centre.y - radius; y <= centre.y + radius; y += 1) {
        for (let x = centre.x - radius; x <= centre.x + radius; x += 1) {
          const cell = wraps ? destinationCell(centre, { x: x - centre.x, y: y - centre.y }, true) : { x, y };
          if (!cell) {
            continue;
          }
          if (!wraps && (cell.x < 0 || cell.x > 15 || cell.y < 0 || cell.y > 15)) {
            continue;
          }
          if (chebyshev(centre, cell) <= radius) {
            cells.push(cell);
          }
        }
      }
      return cells;
    }
    default:
      return [aim];
  }
}

export function actorsInCells(actors: readonly ActorState[], cells: readonly MapCoordinate[]): ActorState[] {
  const keys = new Set(cells.map((cell) => `${cell.y},${cell.x}`));
  return actors.filter((actor) => keys.has(`${actor.y},${actor.x}`));
}
