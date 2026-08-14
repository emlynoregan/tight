import { compareCoordinates, MAP_SIZE, type MapCoordinate } from "../model/plane";

export function cellKey(coord: MapCoordinate): string {
  return `${coord.y},${coord.x}`;
}

export function inBounds(coord: MapCoordinate): boolean {
  return coord.x >= 0 && coord.x < MAP_SIZE && coord.y >= 0 && coord.y < MAP_SIZE;
}

export function wrapCoord(coord: MapCoordinate): MapCoordinate {
  return {
    x: ((coord.x % MAP_SIZE) + MAP_SIZE) % MAP_SIZE,
    y: ((coord.y % MAP_SIZE) + MAP_SIZE) % MAP_SIZE,
  };
}

export function canonicalizeCells(cells: Iterable<MapCoordinate>): MapCoordinate[] {
  return [...cells].sort(compareCoordinates);
}

export const ORTHOGONAL: readonly MapCoordinate[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function orthogonalNeighbours(coord: MapCoordinate, wrap: boolean): MapCoordinate[] {
  const neighbours: MapCoordinate[] = [];
  for (const delta of ORTHOGONAL) {
    const raw = { x: coord.x + delta.x, y: coord.y + delta.y };
    if (wrap) {
      neighbours.push(wrapCoord(raw));
      continue;
    }
    if (inBounds(raw)) {
      neighbours.push(raw);
    }
  }
  return neighbours;
}

export function manhattan(left: MapCoordinate, right: MapCoordinate): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function chebyshev(left: MapCoordinate, right: MapCoordinate): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

export function allCells(): MapCoordinate[] {
  const cells: MapCoordinate[] = [];
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      cells.push({ x, y });
    }
  }
  return canonicalizeCells(cells);
}

export function emptyGrid<T>(fill: T): T[][] {
  return Array.from({ length: MAP_SIZE }, () => Array.from({ length: MAP_SIZE }, () => fill));
}
