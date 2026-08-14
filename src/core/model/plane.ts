export type DimensionNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export const DIMENSION_COUNT = 16;
export const MAP_SIZE = 16;

/** Canonical unordered plane pair with a < b. */
export interface PlanePair {
  readonly a: DimensionNumber;
  readonly b: DimensionNumber;
}

export interface MapCoordinate {
  readonly x: number;
  readonly y: number;
}

export function isDimensionNumber(value: number): value is DimensionNumber {
  return Number.isInteger(value) && value >= 0 && value <= 15;
}

export function canonicalizePlane(left: number, right: number): PlanePair {
  if (!isDimensionNumber(left) || !isDimensionNumber(right)) {
    throw new Error(`Invalid dimension in plane pair (${left},${right})`);
  }
  if (left === right) {
    throw new Error(`Plane dimensions must be distinct: (${left},${right})`);
  }
  return left < right
    ? { a: left, b: right }
    : { a: right, b: left };
}

export function planeKey(plane: PlanePair): string {
  return `${plane.a},${plane.b}`;
}

export function parsePlaneKey(key: string): PlanePair {
  const [left, right] = key.split(",").map((part) => Number(part));
  if (left === undefined || right === undefined) {
    throw new Error(`Invalid plane key: ${key}`);
  }
  return canonicalizePlane(left, right);
}

export function planesEqual(left: PlanePair, right: PlanePair): boolean {
  return left.a === right.a && left.b === right.b;
}

/** All 120 unordered pairs, lexicographic (a,b). */
export function enumeratePlanes(): readonly PlanePair[] {
  const planes: PlanePair[] = [];
  for (let a = 0; a < DIMENSION_COUNT; a += 1) {
    for (let b = a + 1; b < DIMENSION_COUNT; b += 1) {
      planes.push({ a: a as DimensionNumber, b: b as DimensionNumber });
    }
  }
  return planes;
}

export function dominantDimension(plane: PlanePair): DimensionNumber {
  return plane.b;
}

export function secondaryDimension(plane: PlanePair): DimensionNumber {
  return plane.a;
}

export function isLegalMapCoordinate(coord: MapCoordinate): boolean {
  return (
    Number.isInteger(coord.x) &&
    Number.isInteger(coord.y) &&
    coord.x >= 0 &&
    coord.x < MAP_SIZE &&
    coord.y >= 0 &&
    coord.y < MAP_SIZE
  );
}

/** Canonical coordinate order is (y,x) ascending. */
export function compareCoordinates(left: MapCoordinate, right: MapCoordinate): number {
  if (left.y !== right.y) {
    return left.y - right.y;
  }
  return left.x - right.x;
}

export function comparePlanes(left: PlanePair, right: PlanePair): number {
  if (left.a !== right.a) {
    return left.a - right.a;
  }
  return left.b - right.b;
}

export const STARTING_PLANE: PlanePair = { a: 0, b: 1 };
export const OLYMPUS_PLANE: PlanePair = { a: 14, b: 15 };
