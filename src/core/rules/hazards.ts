import { CONTENT_REGISTRY } from "../data/registry";
import type { PlaneBase } from "../generation/plane-types";
import { planeKey, type MapCoordinate } from "../model/plane";
import type { ActorState, SaveState } from "../model/save-state";
import { equippedProtectionTags } from "./actor-stats";
import { applyEffectIds } from "./apply-effects";
import { addWorldFlag } from "./grants";
import type { TickEvent } from "./tick-events";

export type HazardTrigger = "onEnter" | "onEndTick";

function consumedFlag(plane: PlaneBase, cell: MapCoordinate, hazardId: string): string {
  return `consumedHazard:${planeKey(plane.plane)}:${cell.x},${cell.y}:${hazardId}`;
}

export function actorHasProtection(save: SaveState, actor: ActorState, tag: string | null): boolean {
  if (!tag) {
    return false;
  }
  if (actor.kind === "player") {
    return equippedProtectionTags(save, actor).includes(tag);
  }
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  return species?.traits.includes(tag) === true;
}

export function applyHazardsAt(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  trigger: HazardTrigger,
  events: TickEvent[],
): void {
  const tileId = plane.terrain[actor.y]?.[actor.x];
  const tile = tileId ? CONTENT_REGISTRY.byId.tile.get(tileId) : undefined;
  const hazardId = tile?.hazardId;
  if (!hazardId) {
    return;
  }
  const hazard = CONTENT_REGISTRY.byId.hazard.get(hazardId);
  if (!hazard || !hazard.triggers.includes(trigger)) {
    return;
  }
  if (save.flags.includes(consumedFlag(plane, actor, hazardId))) {
    return;
  }
  if (actorHasProtection(save, actor, hazard.protectionTag)) {
    return;
  }
  applyEffectIds(save, plane, hazard.effectIds, actor, null, events);
  events.push({ type: "hazard_triggered", actorId: actor.id, detail: hazard.id, x: actor.x, y: actor.y });
  if (hazard.consumed) {
    addWorldFlag(save, consumedFlag(plane, actor, hazardId));
  }
}

export function applyEndTickHazards(save: SaveState, plane: PlaneBase, events: TickEvent[]): void {
  for (const actor of save.actors) {
    if (actor.plane.a !== plane.plane.a || actor.plane.b !== plane.plane.b) {
      continue;
    }
    applyHazardsAt(save, plane, actor, "onEndTick", events);
  }
}
