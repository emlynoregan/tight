import { CONTENT_REGISTRY } from "../data/registry";
import { inBounds, wrapCoord } from "../generation/grid";
import { isOccupiable } from "../generation/plane-occupancy";
import type { PlaneBase } from "../generation/plane-types";
import type { MapCoordinate } from "../model/plane";
import type { ActorState } from "../model/save-state";

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

export function canOccupy(plane: PlaneBase, actors: readonly ActorState[], cell: MapCoordinate, moverId: string): boolean {
  if (cellBlockedByTerrain(plane, cell)) {
    return false;
  }
  const occupant = actorAt(actors, cell, moverId);
  return !occupant?.blocking;
}

export function featureAt(plane: PlaneBase, cell: MapCoordinate): string | null {
  return plane.features[cell.y]?.[cell.x] ?? null;
}

export function featureIsInteractive(featureId: string | null): boolean {
  if (!featureId) {
    return false;
  }
  return CONTENT_REGISTRY.byId.feature.get(featureId)?.interact === true;
}
