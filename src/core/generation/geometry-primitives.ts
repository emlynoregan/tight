import { compareCoordinates, type MapCoordinate } from "../model/plane";
import {
  boundedInt,
  boundedUnit,
  semantic,
  weightedChoice,
  type SemanticPart,
} from "./semantic-random";
import {
  allCells,
  canonicalizeCells,
  cellKey,
  chebyshev,
  inBounds,
  manhattan,
  orthogonalNeighbours,
} from "./grid";
import type { PrimitiveContext, PrimitiveResult } from "./plane-types";

export type CellPredicate = (cell: MapCoordinate) => boolean;

const COMPACTNESS_BONUS = { low: 0, medium: 4, high: 8 } as const;
const BRANCH_BONUS = { low: 6, medium: 3, high: 0 } as const;
const WANDER_WEIGHT = { low: 1, medium: 3, high: 6 } as const;
const SCATTER_DENSITY_PERCENT = { low: 8, medium: 18 } as const;

export function primitiveParts(
  context: PrimitiveContext,
  localDecisionTag: string,
  localOrdinal?: number,
): SemanticPart[] {
  const parts: SemanticPart[] = [
    semantic.string(context.generatorVersion),
    semantic.string(context.worldSeed),
    semantic.plane(context.plane),
    semantic.string(context.purposeTag),
    semantic.string(context.featureRecipeInstanceId),
    semantic.i64(context.primitiveOrdinal),
    semantic.i64(context.attempt),
    semantic.string(localDecisionTag),
  ];
  if (localOrdinal !== undefined) {
    parts.push(semantic.i64(localOrdinal));
  }
  return parts;
}

function chooseCell(context: PrimitiveContext, tag: string, cells: readonly MapCoordinate[], ordinal?: number): MapCoordinate {
  const sorted = canonicalizeCells(cells);
  const index = boundedUnit(primitiveParts(context, tag, ordinal), sorted.length);
  return sorted[index]!;
}

function legalCells(allowed: CellPredicate): MapCoordinate[] {
  return allCells().filter(allowed);
}

export function rasterizeBresenham(start: MapCoordinate, end: MapCoordinate): MapCoordinate[] {
  let x0 = start.x;
  let y0 = start.y;
  const x1 = end.x;
  const y1 = end.y;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const cells: MapCoordinate[] = [];
  for (;;) {
    cells.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
}

function dominantLeft(start: MapCoordinate, end: MapCoordinate): MapCoordinate {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
  }
  return dy >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
}

export function expandWidth2(
  centreline: readonly MapCoordinate[],
  start: MapCoordinate,
  end: MapCoordinate,
  allowed: CellPredicate,
): MapCoordinate[] {
  const left = dominantLeft(start, end);
  const right = { x: -left.x, y: -left.y };
  const seen = new Set<string>();
  const out: MapCoordinate[] = [];
  const add = (cell: MapCoordinate): void => {
    const key = cellKey(cell);
    if (seen.has(key) || !allowed(cell)) {
      return;
    }
    seen.add(key);
    out.push(cell);
  };
  for (const cell of centreline) {
    add(cell);
    const leftCell = { x: cell.x + left.x, y: cell.y + left.y };
    if (allowed(leftCell)) {
      add(leftCell);
    } else {
      add({ x: cell.x + right.x, y: cell.y + right.y });
    }
  }
  return canonicalizeCells(out);
}

export function generateRectangle(
  context: PrimitiveContext,
  width: number,
  height: number,
  allowed: CellPredicate,
  rotateAllowed: boolean,
): PrimitiveResult {
  const orientations: { w: number; h: number }[] = [{ w: width, h: height }];
  if (rotateAllowed && width !== height) {
    orientations.push({ w: height, h: width });
  }
  const legalOrientations = orientations.filter((orientation) =>
    allCells().some((origin) => rectangleFits(origin, orientation.w, orientation.h, allowed)),
  );
  if (legalOrientations.length === 0) {
    return { ok: false, reason: "no legal rectangle" };
  }
  const orientationIndex = boundedUnit(primitiveParts(context, "orientation"), legalOrientations.length);
  const chosen = legalOrientations[orientationIndex]!;
  const origins = allCells().filter((origin) => rectangleFits(origin, chosen.w, chosen.h, allowed));
  if (origins.length === 0) {
    return { ok: false, reason: "no legal rectangle origin" };
  }
  const origin = chooseCell(context, "origin", origins);
  return { ok: true, cells: rectangleCells(origin, chosen.w, chosen.h) };
}

function rectangleFits(origin: MapCoordinate, width: number, height: number, allowed: CellPredicate): boolean {
  return rectangleCells(origin, width, height).every(allowed);
}

export function rectangleCells(origin: MapCoordinate, width: number, height: number): MapCoordinate[] {
  const cells: MapCoordinate[] = [];
  for (let y = origin.y; y < origin.y + height; y += 1) {
    for (let x = origin.x; x < origin.x + width; x += 1) {
      cells.push({ x, y });
    }
  }
  return canonicalizeCells(cells);
}

export function generateStrip(
  context: PrimitiveContext,
  width: number,
  length: number,
  allowed: CellPredicate,
): PrimitiveResult {
  return generateRectangle(context, length, width, allowed, true);
}

export function generateLine(
  start: MapCoordinate,
  end: MapCoordinate,
  width: number,
  allowed: CellPredicate,
): PrimitiveResult {
  const centre = rasterizeBresenham(start, end);
  if (!centre.every(allowed)) {
    return { ok: false, reason: "line leaves allowed region" };
  }
  const cells = width >= 2 ? expandWidth2(centre, start, end, allowed) : centre;
  return { ok: true, cells: canonicalizeCells(cells) };
}

export function generateWanderPath(
  context: PrimitiveContext,
  start: MapCoordinate,
  end: MapCoordinate,
  wander: "low" | "medium" | "high",
  width: number,
  allowed: CellPredicate,
): PrimitiveResult {
  const wanderWeight = WANDER_WEIGHT[wander];
  const emitted = new Set<string>([cellKey(start)]);
  const centre: MapCoordinate[] = [start];
  let current = start;
  let steps = 0;
  while (current.x !== end.x || current.y !== end.y) {
    if (steps >= 128) {
      const fallback = rasterizeBresenham(current, end).slice(1);
      if (!fallback.every(allowed)) {
        return { ok: false, reason: "wander path failed to reach end" };
      }
      centre.push(...fallback);
      break;
    }
    const options = orthogonalNeighbours(current, false).filter(allowed);
    if (options.length === 0) {
      return { ok: false, reason: "wander path trapped" };
    }
    const here = manhattan(current, end);
    const entries = options.map((cell) => {
      const distance = manhattan(cell, end);
      let weight = 0;
      if (distance < here) {
        weight = 12;
      } else if (distance === here) {
        weight = wanderWeight;
      } else {
        weight = Math.max(0, wanderWeight - 2);
      }
      if (emitted.has(cellKey(cell)) && (cell.x !== end.x || cell.y !== end.y)) {
        weight = 0;
      }
      return { id: cellKey(cell), weight, value: cell };
    });
    if (entries.every((entry) => entry.weight <= 0)) {
      return { ok: false, reason: "wander path has no weighted step" };
    }
    current = weightedChoice(primitiveParts(context, "step", steps), entries);
    centre.push(current);
    emitted.add(cellKey(current));
    steps += 1;
  }
  const cells = width >= 2 ? expandWidth2(centre, start, end, allowed) : centre;
  return { ok: true, cells: canonicalizeCells(cells) };
}

export function generateBlob(
  context: PrimitiveContext,
  area: number,
  compactness: "low" | "medium" | "high",
  branchiness: "low" | "medium" | "high",
  allowed: CellPredicate,
  minimumArea = 1,
): PrimitiveResult {
  const seeds = legalCells(allowed);
  if (seeds.length === 0) {
    return { ok: false, reason: "no blob seed" };
  }
  const seed = chooseCell(context, "seed", seeds);
  const blob = new Set<string>([cellKey(seed)]);
  const cells: MapCoordinate[] = [seed];
  const compactnessBonus = COMPACTNESS_BONUS[compactness];
  const branchBonus = BRANCH_BONUS[branchiness];
  let growth = 0;
  while (blob.size < area) {
    const frontierMap = new Map<string, MapCoordinate>();
    for (const cell of cells) {
      for (const neighbour of orthogonalNeighbours(cell, false)) {
        const key = cellKey(neighbour);
        if (!blob.has(key) && allowed(neighbour)) {
          frontierMap.set(key, neighbour);
        }
      }
    }
    const frontier = canonicalizeCells(frontierMap.values());
    if (frontier.length === 0) {
      return blob.size >= minimumArea ? { ok: true, cells: canonicalizeCells(cells) } : { ok: false, reason: "blob frontier empty" };
    }
    const entries = frontier.map((cell) => {
      const n = orthogonalNeighbours(cell, false).filter((neighbour) => blob.has(cellKey(neighbour))).length;
      const weight = 1 + compactnessBonus * n + branchBonus * (n === 1 ? 1 : 0);
      return { id: cellKey(cell), weight, value: cell };
    });
    const chosen = weightedChoice(primitiveParts(context, "growth", growth), entries);
    blob.add(cellKey(chosen));
    cells.push(chosen);
    growth += 1;
  }
  return { ok: true, cells: canonicalizeCells(cells) };
}

export function generateCluster(
  context: PrimitiveContext,
  count: number,
  radius: number,
  minSpacing: number,
  allowed: CellPredicate,
  minimumCount: number,
  centreOccupied: boolean,
): PrimitiveResult {
  const centres = legalCells(allowed);
  if (centres.length === 0) {
    return { ok: false, reason: "no cluster centre" };
  }
  const centre = chooseCell(context, "centre", centres);
  let candidates = legalCells(allowed).filter((cell) => manhattan(cell, centre) <= radius);
  if (!centreOccupied) {
    candidates = candidates.filter((cell) => cell.x !== centre.x || cell.y !== centre.y);
  }
  const selected: MapCoordinate[] = [];
  let ordinal = 0;
  while (selected.length < count && candidates.length > 0) {
    const entries = candidates.map((cell) => ({
      id: cellKey(cell),
      weight: radius + 1 - manhattan(cell, centre),
      value: cell,
    }));
    const chosen = weightedChoice(primitiveParts(context, "member", ordinal), entries);
    selected.push(chosen);
    candidates = candidates.filter((cell) => manhattan(cell, chosen) >= minSpacing);
    ordinal += 1;
  }
  if (selected.length < minimumCount) {
    return { ok: false, reason: "cluster below minimum" };
  }
  return { ok: true, cells: canonicalizeCells(selected) };
}

export function generateScatter(
  context: PrimitiveContext,
  density: "low" | "medium",
  minSpacing: number,
  allowed: CellPredicate,
  countRange?: { min: number; max: number },
  hardMinimum = 0,
): PrimitiveResult {
  let candidates = legalCells(allowed);
  if (candidates.length === 0) {
    return hardMinimum <= 0 ? { ok: true, cells: [] } : { ok: false, reason: "no scatter candidates" };
  }
  const target = countRange
    ? boundedInt(primitiveParts(context, "count"), countRange.min, countRange.max)
    : Math.floor((candidates.length * SCATTER_DENSITY_PERCENT[density]) / 100);
  const selected: MapCoordinate[] = [];
  let ordinal = 0;
  while (selected.length < target && candidates.length > 0) {
    const chosen = chooseCell(context, "select", candidates, ordinal);
    selected.push(chosen);
    candidates = candidates.filter((cell) => manhattan(cell, chosen) >= minSpacing);
    ordinal += 1;
  }
  if (selected.length < hardMinimum) {
    return { ok: false, reason: "scatter below minimum" };
  }
  return { ok: true, cells: canonicalizeCells(selected) };
}

export function generateRing(
  context: PrimitiveContext,
  radius: number,
  thickness: number,
  allowed: CellPredicate,
): PrimitiveResult {
  const combinations: { centre: MapCoordinate; radius: number }[] = [];
  for (const centre of allCells()) {
    const cells = ringCells(centre, radius, thickness);
    if (cells.length > 0 && cells.every(allowed)) {
      combinations.push({ centre, radius });
    }
  }
  if (combinations.length === 0) {
    return { ok: false, reason: "no legal ring" };
  }
  combinations.sort((left, right) => compareCoordinates(left.centre, right.centre) || left.radius - right.radius);
  const index = boundedUnit(primitiveParts(context, "ring"), combinations.length);
  const chosen = combinations[index]!;
  return { ok: true, cells: ringCells(chosen.centre, chosen.radius, thickness) };
}

export function ringCells(centre: MapCoordinate, radius: number, thickness = 1): MapCoordinate[] {
  const min = Math.max(1, radius - thickness + 1);
  const cells: MapCoordinate[] = [];
  for (const cell of allCells()) {
    const distance = chebyshev(cell, centre);
    if (distance >= min && distance <= radius) {
      cells.push(cell);
    }
  }
  return canonicalizeCells(cells);
}

export type StampTransform = "identity" | "rotate90" | "rotate180" | "rotate270" | "mirrorH";

export interface StampMatrix {
  readonly cells: readonly (readonly (string | null)[])[];
  readonly namedPoints: Readonly<Record<string, MapCoordinate>>;
}

function transformMatrix(matrix: StampMatrix, transform: StampTransform): StampMatrix {
  const height = matrix.cells.length;
  const width = matrix.cells[0]?.length ?? 0;
  const mapPoint = (point: MapCoordinate): MapCoordinate => {
    switch (transform) {
      case "identity":
        return point;
      case "rotate90":
        return { x: height - 1 - point.y, y: point.x };
      case "rotate180":
        return { x: width - 1 - point.x, y: height - 1 - point.y };
      case "rotate270":
        return { x: point.y, y: width - 1 - point.x };
      case "mirrorH":
        return { x: width - 1 - point.x, y: point.y };
    }
  };
  const outHeight = transform === "rotate90" || transform === "rotate270" ? width : height;
  const outWidth = transform === "rotate90" || transform === "rotate270" ? height : width;
  const cells: (string | null)[][] = Array.from({ length: outHeight }, () => Array.from({ length: outWidth }, () => null));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mapped = mapPoint({ x, y });
      cells[mapped.y]![mapped.x] = matrix.cells[y]![x] ?? null;
    }
  }
  const namedPoints: Record<string, MapCoordinate> = {};
  for (const [name, point] of Object.entries(matrix.namedPoints)) {
    namedPoints[name] = mapPoint(point);
  }
  return { cells, namedPoints };
}

function matrixSignature(matrix: StampMatrix): string {
  return JSON.stringify({
    cells: matrix.cells,
    namedPoints: Object.fromEntries(
      Object.entries(matrix.namedPoints).sort(([left], [right]) => (left < right ? -1 : 1)),
    ),
  });
}

export function generateStamp(
  context: PrimitiveContext,
  matrix: StampMatrix,
  allowedTransforms: readonly StampTransform[],
  allowed: CellPredicate,
): PrimitiveResult & { namedPoints?: Readonly<Record<string, MapCoordinate>>; origin?: MapCoordinate } {
  const considered: StampTransform[] = [];
  const seen = new Set<string>();
  for (const transform of ["identity", "rotate90", "rotate180", "rotate270", "mirrorH"] as const) {
    if (!allowedTransforms.includes(transform)) {
      continue;
    }
    const transformed = transformMatrix(matrix, transform);
    const signature = matrixSignature(transformed);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    considered.push(transform);
  }
  const legal: { transform: StampTransform; origins: MapCoordinate[] }[] = [];
  for (const transform of considered) {
    const transformed = transformMatrix(matrix, transform);
    const origins = allCells().filter((origin) => stampFits(origin, transformed, allowed));
    if (origins.length > 0) {
      legal.push({ transform, origins: canonicalizeCells(origins) });
    }
  }
  if (legal.length === 0) {
    return { ok: false, reason: "no legal stamp placement" };
  }
  const transformIndex = boundedUnit(primitiveParts(context, "transform"), legal.length);
  const chosen = legal[transformIndex]!;
  const origin = chooseCell(context, "origin", chosen.origins);
  const transformed = transformMatrix(matrix, chosen.transform);
  const cells = stampCells(origin, transformed);
  const namedPoints: Record<string, MapCoordinate> = {};
  for (const [name, point] of Object.entries(transformed.namedPoints)) {
    namedPoints[name] = { x: origin.x + point.x, y: origin.y + point.y };
  }
  return { ok: true, cells, namedPoints, origin };
}

function stampFits(origin: MapCoordinate, matrix: StampMatrix, allowed: CellPredicate): boolean {
  const height = matrix.cells.length;
  const width = matrix.cells[0]?.length ?? 0;
  if (!inBounds({ x: origin.x + width - 1, y: origin.y + height - 1 })) {
    return false;
  }
  return stampCells(origin, matrix).every(allowed);
}

function stampCells(origin: MapCoordinate, matrix: StampMatrix): MapCoordinate[] {
  const cells: MapCoordinate[] = [];
  for (let y = 0; y < matrix.cells.length; y += 1) {
    for (let x = 0; x < (matrix.cells[y]?.length ?? 0); x += 1) {
      if (matrix.cells[y]![x] !== null) {
        cells.push({ x: origin.x + x, y: origin.y + y });
      }
    }
  }
  return canonicalizeCells(cells);
}
