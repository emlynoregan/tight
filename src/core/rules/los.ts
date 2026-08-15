import { CONTENT_REGISTRY } from "../data/registry";
import type { PlaneBase } from "../generation/plane-types";
import type { MapCoordinate } from "../model/plane";
import type { SaveState } from "../model/save-state";
import { doorRuntimeState } from "./occupancy";

function sign(value: number): number {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
}

/** Supercover line: corner touching visits both adjacent cells. LOS does not wrap. */
export function supercoverLine(start: MapCoordinate, end: MapCoordinate): MapCoordinate[] {
  const cells: MapCoordinate[] = [{ x: start.x, y: start.y }];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const signX = sign(dx);
  const signY = sign(dy);
  let x = start.x;
  let y = start.y;
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    const xDecision = (1 + 2 * ix) * ny;
    const yDecision = (1 + 2 * iy) * nx;
    if (xDecision === yDecision) {
      cells.push({ x: x + signX, y });
      cells.push({ x, y: y + signY });
      x += signX;
      y += signY;
      cells.push({ x, y });
      ix += 1;
      iy += 1;
    } else if (xDecision < yDecision) {
      x += signX;
      ix += 1;
      cells.push({ x, y });
    } else {
      y += signY;
      iy += 1;
      cells.push({ x, y });
    }
  }
  return cells;
}

function cellBlocks(plane: PlaneBase, cell: MapCoordinate, kind: "los" | "loe", save?: SaveState): boolean {
  const tileId = plane.terrain[cell.y]?.[cell.x];
  const tile = tileId ? CONTENT_REGISTRY.byId.tile.get(tileId) : undefined;
  if (kind === "los" ? tile?.blocksLos : tile?.blocksLoe) {
    return true;
  }
  const featureId = plane.features[cell.y]?.[cell.x];
  if (!featureId) {
    return false;
  }
  const feature = CONTENT_REGISTRY.byId.feature.get(featureId);
  if (!feature) {
    return false;
  }
  const flag = kind === "los" ? feature.blocksLos : feature.blocksLos;
  if (flag === "state") {
    if (featureId === "door") {
      return save ? doorRuntimeState(save, plane, cell) !== "open" : true;
    }
    return true;
  }
  return flag === true;
}

function lineClear(plane: PlaneBase, start: MapCoordinate, end: MapCoordinate, kind: "los" | "loe", save?: SaveState): boolean {
  const cells = supercoverLine(start, end);
  for (const cell of cells) {
    if (cell.x === start.x && cell.y === start.y) {
      continue;
    }
    if (cell.x === end.x && cell.y === end.y) {
      continue;
    }
    if (cellBlocks(plane, cell, kind, save)) {
      return false;
    }
  }
  return true;
}

export function hasLineOfSight(plane: PlaneBase, start: MapCoordinate, end: MapCoordinate, save?: SaveState): boolean {
  return lineClear(plane, start, end, "los", save);
}

export function hasLineOfEffect(plane: PlaneBase, start: MapCoordinate, end: MapCoordinate, save?: SaveState): boolean {
  return lineClear(plane, start, end, "loe", save);
}
