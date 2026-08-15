import { CONTENT_REGISTRY } from "../data/registry";
import type { ProgressionSource } from "../generation/topology-types";
import type { GameRuntime } from "../runtime/game-runtime";
import { collectProgressionSource } from "./grants";
import { itemQuantity, removeInventoryItem } from "./inventory";
import type { TickEvent } from "./tick-events";

export function shopSourcesFor(runtime: GameRuntime, shopInstanceId: string): ProgressionSource[] {
  return runtime.topology.progressionSources.filter(
    (source) => source.sourceType === "shop_stock" && source.id.startsWith(`source.shop_stock.${shopInstanceId}.`),
  );
}

export function shopInstanceForNpc(runtime: GameRuntime, actorId: string) {
  const byNpc = runtime.topology.shopInstances.find((shop) => shop.npcInstanceId === actorId);
  if (byNpc) {
    return byNpc;
  }
  if (actorId.endsWith(".shopkeeper")) {
    const shopId = actorId.slice(0, -".shopkeeper".length);
    return runtime.topology.shopInstances.find((shop) => shop.id === shopId);
  }
  const npc = runtime.topology.npcInstances.find((row) => row.id === actorId);
  if (!npc) {
    return undefined;
  }
  return runtime.topology.shopInstances.find(
    (shop) =>
      shop.npcInstanceId === npc.id ||
      CONTENT_REGISTRY.shopInstances.some((row) => row.id === shop.catalogueShopId && row.npcId === npc.npcId),
  );
}

export function buyShopSource(runtime: GameRuntime, sourceId: string, events: TickEvent[]): boolean {
  const source = runtime.topology.progressionSources.find((row) => row.id === sourceId);
  if (!source || source.sourceType !== "shop_stock") {
    return false;
  }
  const price = source.price ?? 0;
  if (runtime.save.player.currency < price) {
    events.push({ type: "action_failed", actorId: "player", detail: "not enough currency" });
    return false;
  }
  if (!source.unlimited && runtime.save.collectedSources.includes(source.id)) {
    events.push({ type: "action_failed", actorId: "player", detail: "out of stock" });
    return false;
  }
  const player = runtime.save.actors.find((actor) => actor.id === "player");
  const dropAt = player ? { x: player.x, y: player.y } : null;
  runtime.save.player.currency -= price;
  collectProgressionSource(runtime.save, source, events, dropAt);
  events.push({ type: "shop_bought", targetId: source.id, detail: source.contentReference, amount: price });
  return true;
}

export function sellPriceFor(itemId: string): number | null {
  const item = CONTENT_REGISTRY.byId.item.get(itemId);
  if (!item) {
    return null;
  }
  if (item.kind === "key" || item.kind === "artefact" || item.rarity === "unique") {
    return null;
  }
  return Math.max(1, Math.floor(item.value / 2));
}

export function sellItem(runtime: GameRuntime, itemId: string, events: TickEvent[]): boolean {
  const price = sellPriceFor(itemId);
  if (price === null) {
    events.push({ type: "action_failed", actorId: "player", detail: "item not sellable" });
    return false;
  }
  if (itemQuantity(runtime.save, itemId) <= 0 || !removeInventoryItem(runtime.save, itemId, 1)) {
    events.push({ type: "action_failed", actorId: "player", detail: "item not in inventory" });
    return false;
  }
  runtime.save.player.currency += price;
  events.push({ type: "shop_sold", detail: itemId, amount: price });
  return true;
}
