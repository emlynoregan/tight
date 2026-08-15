import type { ProgressionSource } from "../generation/topology-types";
import { CONTENT_REGISTRY } from "../data/registry";
import type { MapCoordinate, PlanePair } from "../model/plane";
import type { SaveState } from "../model/save-state";
import { tryAddItem } from "./inventory";
import type { TickEvent } from "./tick-events";

export interface GrantToken {
  readonly kind: string;
  readonly value: string;
}

export function parseGrantToken(token: string): GrantToken | null {
  const split = token.indexOf(":");
  if (split <= 0 || split === token.length - 1) {
    return null;
  }
  return { kind: token.slice(0, split), value: token.slice(split + 1) };
}

export function addWorldFlag(save: SaveState, flag: string): boolean {
  if (save.flags.includes(flag)) {
    return false;
  }
  save.flags.push(flag);
  return true;
}

export function sourceCollected(save: SaveState, sourceId: string): boolean {
  return save.collectedSources.includes(sourceId);
}

export function markSourceCollected(save: SaveState, sourceId: string): void {
  if (!save.collectedSources.includes(sourceId)) {
    save.collectedSources.push(sourceId);
  }
}

export function spawnGroundItem(
  save: SaveState,
  itemId: string,
  quantity: number,
  plane: PlanePair,
  cell: MapCoordinate,
): void {
  save.groundItems.push({
    id: `ground.${save.tick}.${itemId}.${save.groundItems.length}`,
    itemId,
    quantity,
    plane: { a: plane.a, b: plane.b },
    x: cell.x,
    y: cell.y,
  });
}

function grantItem(
  save: SaveState,
  itemId: string,
  quantity: number,
  dropAt: MapCoordinate | null,
  events: TickEvent[],
): boolean {
  if (!tryAddItem(save, itemId, quantity)) {
    if (dropAt) {
      spawnGroundItem(save, itemId, quantity, save.plane, dropAt);
      events.push({ type: "item_dropped", detail: itemId, x: dropAt.x, y: dropAt.y });
      return true;
    }
    return false;
  }
  events.push({ type: "item_gained", detail: itemId, amount: quantity });
  return true;
}

export function learnAbility(save: SaveState, abilityId: string, events: TickEvent[]): boolean {
  if (save.player.learnedAbilities.includes(abilityId)) {
    return false;
  }
  save.player.learnedAbilities.push(abilityId);
  events.push({ type: "ability_learned", detail: abilityId });
  return true;
}

export function grantApEvent(save: SaveState, eventId: string, uniqueKey: string, events: TickEvent[]): number {
  if (save.awardedApEvents.includes(uniqueKey)) {
    return 0;
  }
  const row = CONTENT_REGISTRY.apRewardEvents.find((entry) => entry.id === eventId);
  const amount = row?.ap ?? 0;
  if (amount <= 0) {
    return 0;
  }
  save.awardedApEvents.push(uniqueKey);
  save.player.unspentAp += amount;
  events.push({ type: "ap_gained", detail: eventId, amount });
  return amount;
}

export function applyGrantTokens(
  save: SaveState,
  grants: readonly string[],
  events: TickEvent[],
  dropAt: MapCoordinate | null = null,
  quantity = 1,
): void {
  for (const grant of grants) {
    const token = parseGrantToken(grant);
    if (!token) {
      continue;
    }
    if (token.kind === "flag") {
      if (addWorldFlag(save, token.value)) {
        events.push({ type: "flag_set", detail: token.value });
      }
      continue;
    }
    if (token.kind === "currency") {
      const amount = Number(token.value) * quantity;
      if (Number.isFinite(amount) && amount !== 0) {
        save.player.currency += amount;
        events.push({ type: "currency_gained", amount });
      }
      continue;
    }
    if (token.kind === "ability") {
      learnAbility(save, token.value, events);
      continue;
    }
    if (token.kind === "ap") {
      grantApEvent(save, token.value, `grant:${token.value}`, events);
      continue;
    }
    if (token.kind === "item" || token.kind === "resource") {
      grantItem(save, token.value, quantity, dropAt, events);
    }
  }
}

export function collectProgressionSource(
  save: SaveState,
  source: ProgressionSource,
  events: TickEvent[],
  dropAt: MapCoordinate | null = null,
): boolean {
  if (!source.unlimited && sourceCollected(save, source.id)) {
    return false;
  }
  if (!source.unlimited) {
    markSourceCollected(save, source.id);
  }
  applyGrantTokens(save, source.grants, events, dropAt, source.quantity);
  events.push({ type: "source_collected", targetId: source.id, detail: source.sourceType });
  return true;
}
