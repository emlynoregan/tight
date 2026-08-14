import { CONTENT_REGISTRY } from "../data/registry";
import { compareCoordinates, type MapCoordinate } from "../model/plane";
import { allCells, cellKey, manhattan, orthogonalNeighbours } from "./grid";
import { isOccupiable, requiredConnected } from "./plane-occupancy";
import type { NamedPoint, PlaneGrid, PlaneRepairEvent, PlaneValidationIssue } from "./plane-types";

const REPAIR_ORDER = [
  "remove_decoration_blocker",
  "remove_optional_scatter_blocker",
  "remove_optional_cluster_member",
  "remove_optional_furniture",
  "carve_shortest_connector",
  "relocate_optional_spawn",
  "relocate_required_spawn_nearest_legal",
  "remove_optional_structure_cell",
  "expand_walkable_region",
  "remove_space_obstacle",
] as const;

const ORIGIN_FOR_RULE: Record<string, PlaneGrid["featureOrigin"][number][number]> = {
  remove_decoration_blocker: "decoration",
  remove_optional_scatter_blocker: "scatter",
  remove_optional_cluster_member: "cluster",
  remove_optional_furniture: "furniture",
  remove_optional_structure_cell: "structure",
};

const CONNECTOR_COST: Record<string, number> = {
  decoration: 1,
  scatter: 1,
  cluster: 1,
  furniture: 2,
  structure: 3,
};

export function repairPlaneGeometry(
  grid: PlaneGrid,
  wraps: boolean,
  familyWalkableTile: string,
  requiredPoints: readonly MapCoordinate[],
  namedPoints: readonly NamedPoint[],
  issues: readonly PlaneValidationIssue[],
): PlaneRepairEvent[] {
  const events: PlaneRepairEvent[] = [];
  for (const rule of REPAIR_ORDER) {
    if (issues.length === 0) {
      break;
    }
    const applied = applyRepair(grid, wraps, familyWalkableTile, requiredPoints, namedPoints, issues, rule);
    events.push(...applied);
  }
  return events;
}

function applyRepair(
  grid: PlaneGrid,
  wraps: boolean,
  familyWalkableTile: string,
  requiredPoints: readonly MapCoordinate[],
  namedPoints: readonly NamedPoint[],
  issues: readonly PlaneValidationIssue[],
  rule: (typeof REPAIR_ORDER)[number],
): PlaneRepairEvent[] {
  const events: PlaneRepairEvent[] = [];
  if (rule in ORIGIN_FOR_RULE) {
    const origin = ORIGIN_FOR_RULE[rule]!;
    for (const point of [...requiredPoints, ...namedPoints.map((row) => ({ x: row.x, y: row.y }))]) {
      if (isOccupiable(grid, point)) {
        continue;
      }
      if (grid.featureOrigin[point.y]![point.x] === origin) {
        grid.features[point.y]![point.x] = null;
        grid.featureOrigin[point.y]![point.x] = null;
        events.push({ rule, detail: "cleared required cell", x: point.x, y: point.y });
      }
    }
  }
  if (rule === "carve_shortest_connector" && issues.some((issue) => issue.validator === "required_points_connected" || issue.validator === "transition_sources_reachable")) {
    const carved = carveShortestConnector(grid, wraps, familyWalkableTile, requiredPoints);
    if (carved) {
      events.push(carved);
    }
  }
  if (rule === "expand_walkable_region" || rule === "remove_space_obstacle") {
    const expanded = expandWalkable(grid, wraps, familyWalkableTile);
    events.push(...expanded.map((cell) => ({ rule, detail: "converted blocker", x: cell.x, y: cell.y })));
  }
  void namedPoints;
  return events;
}

function expandWalkable(grid: PlaneGrid, wraps: boolean, familyWalkableTile: string): MapCoordinate[] {
  const converted: MapCoordinate[] = [];
  const occupiable = allCells().filter((cell) => isOccupiable(grid, cell));
  if (occupiable.length === 0) {
    const first = allCells()[0]!;
    grid.terrain[first.y]![first.x] = familyWalkableTile;
    grid.features[first.y]![first.x] = null;
    converted.push(first);
    return converted;
  }
  const candidates = allCells()
    .filter((cell) => !isOccupiable(grid, cell) && grid.featureOrigin[cell.y]![cell.x] !== "required")
    .sort((left, right) => {
      const leftDist = Math.min(...occupiable.map((cell) => manhattan(cell, left)));
      const rightDist = Math.min(...occupiable.map((cell) => manhattan(cell, right)));
      return leftDist - rightDist || compareCoordinates(left, right);
    });
  for (const cell of candidates.slice(0, 8)) {
    grid.terrain[cell.y]![cell.x] = familyWalkableTile;
    if (grid.featureOrigin[cell.y]![cell.x] !== "required") {
      grid.features[cell.y]![cell.x] = null;
      grid.featureOrigin[cell.y]![cell.x] = null;
    }
    converted.push(cell);
  }
  void wraps;
  return converted;
}

function carveShortestConnector(
  grid: PlaneGrid,
  wraps: boolean,
  familyWalkableTile: string,
  requiredPoints: readonly MapCoordinate[],
): PlaneRepairEvent | null {
  const occupiableRequired = requiredPoints.filter((point) => isOccupiable(grid, point));
  if (occupiableRequired.length < 2) {
    return null;
  }
  if (requiredConnected(grid, occupiableRequired, wraps)) {
    return null;
  }
  const start = occupiableRequired[0]!;
  const path = dijkstraConnector(grid, wraps, start, occupiableRequired.slice(1));
  if (!path) {
    return null;
  }
  for (const cell of path) {
    if (isOccupiable(grid, cell)) {
      continue;
    }
    grid.terrain[cell.y]![cell.x] = familyWalkableTile;
    if (grid.featureOrigin[cell.y]![cell.x] !== "required") {
      grid.features[cell.y]![cell.x] = null;
      grid.featureOrigin[cell.y]![cell.x] = null;
    }
  }
  return { rule: "carve_shortest_connector", detail: `length ${path.length}` };
}

function dijkstraConnector(
  grid: PlaneGrid,
  wraps: boolean,
  start: MapCoordinate,
  goals: readonly MapCoordinate[],
): MapCoordinate[] | null {
  const goalKeys = new Set(goals.map(cellKey));
  const cost = new Map<string, number>([[cellKey(start), 0]]);
  const prev = new Map<string, MapCoordinate>();
  const queue: { cell: MapCoordinate; cost: number }[] = [{ cell: start, cost: 0 }];
  const seen = new Set<string>();
  while (queue.length > 0) {
    queue.sort((left, right) => left.cost - right.cost || compareCoordinates(left.cell, right.cell));
    const current = queue.shift()!;
    const key = cellKey(current.cell);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (goalKeys.has(key) && (current.cell.x !== start.x || current.cell.y !== start.y)) {
      return reconstruct(prev, current.cell, start);
    }
    for (const neighbour of orthogonalNeighbours(current.cell, wraps)) {
      const step = stepCost(grid, neighbour);
      if (step === Number.POSITIVE_INFINITY) {
        continue;
      }
      const nextCost = current.cost + step;
      const neighbourKey = cellKey(neighbour);
      if (nextCost < (cost.get(neighbourKey) ?? Number.POSITIVE_INFINITY)) {
        cost.set(neighbourKey, nextCost);
        prev.set(neighbourKey, current.cell);
        queue.push({ cell: neighbour, cost: nextCost });
      }
    }
  }
  return null;
}

function stepCost(grid: PlaneGrid, cell: MapCoordinate): number {
  if (isOccupiable(grid, cell)) {
    return 0;
  }
  const origin = grid.featureOrigin[cell.y]![cell.x];
  if (origin === "required") {
    return Number.POSITIVE_INFINITY;
  }
  if (origin && origin in CONNECTOR_COST) {
    return CONNECTOR_COST[origin]!;
  }
  const tile = CONTENT_REGISTRY.byId.tile.get(grid.terrain[cell.y]![cell.x]!);
  if (tile && !tile.walkable) {
    return 4;
  }
  return 4;
}

function reconstruct(prev: Map<string, MapCoordinate>, end: MapCoordinate, start: MapCoordinate): MapCoordinate[] {
  const path = [end];
  let current = end;
  while (current.x !== start.x || current.y !== start.y) {
    const parent = prev.get(cellKey(current));
    if (!parent) {
      break;
    }
    path.push(parent);
    current = parent;
  }
  return path.reverse();
}
