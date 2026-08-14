import { DIMENSION_COUNT, canonicalizePlane, comparePlanes, type PlanePair } from "../model/plane";

export function potentialNeighbours(plane: PlanePair): PlanePair[] {
  const neighbours: PlanePair[] = [];
  for (let d = 0; d < DIMENSION_COUNT; d += 1) {
    if (d !== plane.a && d !== plane.b) {
      neighbours.push(canonicalizePlane(plane.a, d));
      neighbours.push(canonicalizePlane(plane.b, d));
    }
  }
  neighbours.sort(comparePlanes);
  return neighbours;
}

export function sharesExactlyOneDimension(left: PlanePair, right: PlanePair): boolean {
  const shared =
    Number(left.a === right.a) +
    Number(left.a === right.b) +
    Number(left.b === right.a) +
    Number(left.b === right.b);
  return shared === 1;
}

export function planeTier(plane: PlanePair): number {
  return Math.floor(plane.b / 2);
}

export function neighbourWeight(source: PlanePair, destination: PlanePair): number {
  const delta = planeTier(destination) - planeTier(source);
  if (delta <= -2) {
    return 4;
  }
  if (delta === -1) {
    return 8;
  }
  if (delta === 0 || delta === 1) {
    return 12;
  }
  if (delta === 2) {
    return 5;
  }
  return 1;
}
