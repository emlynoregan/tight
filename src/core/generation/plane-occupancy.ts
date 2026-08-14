import { CONTENT_REGISTRY } from "../data/registry";
import type { MapCoordinate } from "../model/plane";
import { cellKey, orthogonalNeighbours } from "./grid";
import type { PlaneGrid } from "./plane-types";

export function isOccupiable(grid: PlaneGrid, cell: MapCoordinate): boolean {
  const tile = CONTENT_REGISTRY.byId.tile.get(grid.terrain[cell.y]![cell.x]!);
  if (!tile?.walkable || !tile.allowsActors) {
    return false;
  }
  const featureId = grid.features[cell.y]![cell.x];
  if (!featureId) {
    return true;
  }
  const feature = CONTENT_REGISTRY.byId.feature.get(featureId);
  return feature?.blocksMovement !== true;
}

export function walkableCells(grid: PlaneGrid, wrap: boolean): MapCoordinate[] {
  const cells: MapCoordinate[] = [];
  for (let y = 0; y < grid.terrain.length; y += 1) {
    for (let x = 0; x < grid.terrain[y]!.length; x += 1) {
      const cell = { x, y };
      if (isOccupiable(grid, cell)) {
        cells.push(cell);
      }
    }
  }
  void wrap;
  return cells;
}

export function connectedComponent(grid: PlaneGrid, start: MapCoordinate, wrap: boolean): Set<string> {
  const seen = new Set<string>();
  if (!isOccupiable(grid, start)) {
    return seen;
  }
  const queue = [start];
  seen.add(cellKey(start));
  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const neighbour of orthogonalNeighbours(cell, wrap)) {
      const key = cellKey(neighbour);
      if (seen.has(key) || !isOccupiable(grid, neighbour)) {
        continue;
      }
      seen.add(key);
      queue.push(neighbour);
    }
  }
  return seen;
}

export function requiredConnected(grid: PlaneGrid, points: readonly MapCoordinate[], wrap: boolean): boolean {
  if (points.length === 0) {
    return true;
  }
  const origin = points[0]!;
  if (!isOccupiable(grid, origin)) {
    return false;
  }
  const component = connectedComponent(grid, origin, wrap);
  return points.every((point) => component.has(cellKey(point)));
}
