import { CONTENT_REGISTRY } from "../data/registry";
import { inBounds, wrapCoord } from "../generation/grid";
import { isOccupiable } from "../generation/plane-occupancy";
import type { PlaneBase } from "../generation/plane-types";
import { planesEqual, type MapCoordinate, type PlanePair } from "../model/plane";
import type { ActorState, SaveState } from "../model/save-state";

export function planeGrid(plane: PlaneBase) {
  return {
    terrain: plane.terrain.map((row) => [...row]),
    features: plane.features.map((row) => [...row]),
    featureOrigin: plane.features.map((row) => row.map(() => null)),
  };
}

export function destinationCell(origin: MapCoordinate, delta: MapCoordinate, wraps: boolean): MapCoordinate | null {
  const raw = { x: origin.x + delta.x, y: origin.y + delta.y };
  if (wraps) {
    return wrapCoord(raw);
  }
  if (!inBounds(raw)) {
    return null;
  }
  return raw;
}

export function cellBlockedByTerrain(plane: PlaneBase, cell: MapCoordinate): boolean {
  return !isOccupiable(planeGrid(plane), cell);
}

export function actorAt(actors: readonly ActorState[], cell: MapCoordinate, exceptId?: string): ActorState | undefined {
  return actors.find((actor) => actor.x === cell.x && actor.y === cell.y && actor.id !== exceptId);
}

export function featureAt(plane: PlaneBase, cell: MapCoordinate): string | null {
  return plane.features[cell.y]?.[cell.x] ?? null;
}

export function featureRuntimeState(save: SaveState, plane: PlanePair, cell: MapCoordinate): string | null {
  return (
    save.featureStates.find(
      (row) => planesEqual(row.plane, plane) && row.x === cell.x && row.y === cell.y,
    )?.state ?? null
  );
}

export function setFeatureRuntimeState(save: SaveState, plane: PlanePair, cell: MapCoordinate, state: string): void {
  const existing = save.featureStates.find(
    (row) => planesEqual(row.plane, plane) && row.x === cell.x && row.y === cell.y,
  );
  if (existing) {
    existing.state = state;
    return;
  }
  save.featureStates.push({ plane: { a: plane.a, b: plane.b }, x: cell.x, y: cell.y, state });
}

export function doorRuntimeState(save: SaveState, plane: PlaneBase, cell: MapCoordinate): "closed" | "open" | "locked" | null {
  if (featureAt(plane, cell) !== "door") {
    return null;
  }
  const state = featureRuntimeState(save, plane.plane, cell);
  if (state === "open" || state === "locked") {
    return state;
  }
  return "closed";
}

export function canOccupy(
  plane: PlaneBase,
  actors: readonly ActorState[],
  cell: MapCoordinate,
  moverId: string,
  save?: SaveState,
): boolean {
  if (cellBlockedByTerrain(plane, cell)) {
    return false;
  }
  if (save) {
    const door = doorRuntimeState(save, plane, cell);
    if (door !== null && door !== "open") {
      return false;
    }
  }
  const occupant = actorAt(actors, cell, moverId);
  return !occupant?.blocking;
}

export function featureIsInteractive(featureId: string | null): boolean {
  if (!featureId) {
    return false;
  }
  return CONTENT_REGISTRY.byId.feature.get(featureId)?.interact === true;
}
