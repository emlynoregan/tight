import { CONTENT_REGISTRY } from "../data/registry";
import { MAP_SIZE, OLYMPUS_PLANE, planesEqual, type MapCoordinate, type PlanePair } from "../model/plane";
import { allCells, cellKey, orthogonalNeighbours } from "./grid";
import { isOccupiable, requiredConnected, walkableCells } from "./plane-occupancy";
import { INTERACTION_POINT_KINDS, type NamedPoint, type PlaneGrid, type PlaneValidationIssue } from "./plane-types";

export interface PlaneValidationInput {
  readonly grid: PlaneGrid;
  readonly wraps: boolean;
  readonly family: string;
  readonly plane: PlanePair;
  readonly namedPoints: readonly NamedPoint[];
  readonly requiredPoints: readonly MapCoordinate[];
  readonly transitionFixtures: readonly { x: number; y: number }[];
}

function inBounds(cell: MapCoordinate): boolean {
  return cell.x >= 0 && cell.x < MAP_SIZE && cell.y >= 0 && cell.y < MAP_SIZE;
}

export function validatePlaneGeometry(input: PlaneValidationInput): PlaneValidationIssue[] {
  const issues: PlaneValidationIssue[] = [];
  const walkableTarget = CONTENT_REGISTRY.planeFamilies.find((family) => family.id === input.family)?.walkableTargetMin ?? 35;
  issues.push(...validateRequiredFixtures(input));
  for (const point of input.requiredPoints) {
    if (!inBounds(point)) {
      issues.push({ validator: "required_points_in_bounds", detail: `${point.x},${point.y}` });
      continue;
    }
    if (!isOccupiable(input.grid, point)) {
      issues.push({ validator: "required_points_occupiable", detail: `${point.x},${point.y}` });
    }
  }
  const occupiableRequired = input.requiredPoints.filter((point) => inBounds(point) && isOccupiable(input.grid, point));
  if (occupiableRequired.length > 0 && !requiredConnected(input.grid, occupiableRequired, input.wraps)) {
    issues.push({ validator: "required_points_connected", detail: "required points are disconnected" });
  }
  const walkable = walkableCells(input.grid, input.wraps);
  const fraction = (100 * walkable.length) / (MAP_SIZE * MAP_SIZE);
  if (fraction < walkableTarget) {
    issues.push({ validator: "minimum_walkable_fraction", detail: `${fraction.toFixed(1)}<${walkableTarget}` });
  }
  for (const fixture of input.transitionFixtures) {
    if (!isOccupiable(input.grid, fixture)) {
      issues.push({ validator: "transition_sources_reachable", detail: `${fixture.x},${fixture.y}` });
    }
  }
  if (occupiableRequired.length > 0) {
    const component = occupiableRequired[0]!;
    if (!requiredConnected(input.grid, [...occupiableRequired, ...input.transitionFixtures], input.wraps) && input.transitionFixtures.length > 0) {
      issues.push({ validator: "transition_sources_reachable", detail: "transition not in required component" });
    }
    void component;
  }
  const anchor = input.namedPoints.find((point) => point.kind === "anchor");
  if (anchor) {
    const hasApproach = allCells().some(
      (cell) => Math.abs(cell.x - anchor.x) + Math.abs(cell.y - anchor.y) === 1 && isOccupiable(input.grid, cell),
    );
    if (!hasApproach) {
      issues.push({ validator: "anchor_has_approach", detail: `${anchor.x},${anchor.y}` });
    }
  }
  if (input.family === "space") {
    const largest = largestComponentSize(input.grid, input.wraps);
    if (largest < 36) {
      issues.push({ validator: "space_has_manoeuvre_region", detail: `component ${largest}` });
    }
  }
  if (planesEqual(input.plane, OLYMPUS_PLANE)) {
    const arena = input.namedPoints.filter((point) => point.kind === "playerEntry" || point.kind === "bossSpawn");
    if (arena.length < 2) {
      issues.push({ validator: "boss_arena_has_space", detail: "missing arena points" });
    }
  }
  return issues;
}

export function interactionPoints(namedPoints: readonly NamedPoint[]): NamedPoint[] {
  return namedPoints.filter((point) => INTERACTION_POINT_KINDS.has(point.kind));
}

function validateRequiredFixtures(input: PlaneValidationInput): PlaneValidationIssue[] {
  const issues: PlaneValidationIssue[] = [];
  const byId = new Map(input.namedPoints.map((point) => [point.id, point]));
  for (const source of input.namedPoints.filter((point) => point.kind === "source")) {
    const approach = byId.get(`${source.id}.approach`);
    if (!approach) {
      issues.push({ validator: "required_points_occupiable", detail: `${source.id} missing approach` });
      continue;
    }
    if (approach.x === source.x && approach.y === source.y) {
      issues.push({ validator: "required_points_occupiable", detail: `${source.id} approach is not distinct` });
    }
    const adjacent = new Set(orthogonalNeighbours(source, input.wraps).map(cellKey));
    if (!adjacent.has(cellKey(approach))) {
      issues.push({ validator: "required_points_occupiable", detail: `${source.id} approach is not adjacent` });
    }
    if (!isOccupiable(input.grid, approach)) {
      issues.push({ validator: "required_points_occupiable", detail: `${approach.x},${approach.y}` });
    }
  }
  for (const counter of input.namedPoints.filter((point) => point.kind === "counter")) {
    const prefix = counter.id.replace(/\.counter$/, "");
    const shopkeeper = byId.get(`${prefix}.shopkeeper`);
    const customer = byId.get(`${prefix}.customer`);
    if (!shopkeeper || !customer) {
      issues.push({ validator: "shop_has_two_sides", detail: `${prefix} missing shopkeeper or customer` });
      continue;
    }
    if (cellKey(shopkeeper) === cellKey(customer) || cellKey(shopkeeper) === cellKey(counter) || cellKey(customer) === cellKey(counter)) {
      issues.push({ validator: "shop_has_two_sides", detail: `${prefix} sides overlap` });
    }
    const counterNeighbours = new Set(orthogonalNeighbours(counter, input.wraps).map(cellKey));
    if (!counterNeighbours.has(cellKey(shopkeeper)) || !counterNeighbours.has(cellKey(customer))) {
      issues.push({ validator: "shop_has_two_sides", detail: `${prefix} sides not adjacent to counter` });
    }
    if (!isOccupiable(input.grid, customer)) {
      issues.push({ validator: "shop_has_two_sides", detail: `${prefix} customer not occupiable` });
    }
  }
  return issues;
}

function largestComponentSize(grid: PlaneGrid, wrap: boolean): number {
  const seen = new Set<string>();
  let best = 0;
  for (const cell of walkableCells(grid, wrap)) {
    const key = `${cell.y},${cell.x}`;
    if (seen.has(key)) {
      continue;
    }
    const stack = [cell];
    seen.add(key);
    let size = 0;
    while (stack.length > 0) {
      const current = stack.pop()!;
      size += 1;
      for (const neighbour of [
        { x: current.x, y: current.y - 1 },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x - 1, y: current.y },
      ]) {
        const wrapped = wrap
          ? { x: ((neighbour.x % MAP_SIZE) + MAP_SIZE) % MAP_SIZE, y: ((neighbour.y % MAP_SIZE) + MAP_SIZE) % MAP_SIZE }
          : neighbour;
        if (!wrap && (wrapped.x < 0 || wrapped.y < 0 || wrapped.x >= MAP_SIZE || wrapped.y >= MAP_SIZE)) {
          continue;
        }
        const neighbourKey = `${wrapped.y},${wrapped.x}`;
        if (seen.has(neighbourKey) || !isOccupiable(grid, wrapped)) {
          continue;
        }
        seen.add(neighbourKey);
        stack.push(wrapped);
      }
    }
    best = Math.max(best, size);
  }
  return best;
}
