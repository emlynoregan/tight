import { chebyshev } from "../generation/grid";
import { MAP_SIZE, type MapCoordinate } from "../model/plane";
import type { VisibilityProfile } from "../model/content-types";
import { CONTENT_REGISTRY } from "../data/registry";
import { hasLineOfSight } from "../rules/los";
import { playerActor, type GameRuntime } from "../runtime/game-runtime";

export function chebyshevOnPlane(left: MapCoordinate, right: MapCoordinate, wraps: boolean): number {
  if (!wraps) {
    return chebyshev(left, right);
  }
  const dx = Math.min(Math.abs(left.x - right.x), MAP_SIZE - Math.abs(left.x - right.x));
  const dy = Math.min(Math.abs(left.y - right.y), MAP_SIZE - Math.abs(left.y - right.y));
  return Math.max(dx, dy);
}

export function visibilityProfileFor(runtime: GameRuntime): VisibilityProfile {
  const player = playerActor(runtime);
  const blinded = player.statuses.some((instance) => CONTENT_REGISTRY.byId.status.get(instance.id)?.blinds === true);
  if (blinded) {
    return CONTENT_REGISTRY.visibilityProfiles.find((profile) => profile.id === "blinded") ?? { id: "blinded", radius: 1 };
  }
  const family = CONTENT_REGISTRY.planeFamilies.find((row) => row.id === runtime.save.family);
  const id = family?.defaultVisibility ?? "clear";
  return CONTENT_REGISTRY.visibilityProfiles.find((profile) => profile.id === id) ?? { id: "clear", radius: "unlimited" };
}

export function cellIsVisible(runtime: GameRuntime, cell: MapCoordinate): boolean {
  const player = playerActor(runtime);
  const profile = visibilityProfileFor(runtime);
  const wraps = runtime.currentPlaneBase.wraps;
  if (profile.radius !== "unlimited" && chebyshevOnPlane(player, cell, wraps) > profile.radius) {
    return false;
  }
  if (cell.x === player.x && cell.y === player.y) {
    return true;
  }
  return hasLineOfSight(runtime.currentPlaneBase, player, cell, runtime.save);
}
