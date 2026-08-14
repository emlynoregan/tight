import { CONTENT_REGISTRY } from "../data/registry";
import { GLOBAL_CONSTANTS } from "../model/constants";
import type { EquipmentSlotId } from "../model/ids";
import { planesEqual } from "../model/plane";
import type { GroundItemState, ItemStack, SaveState } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { playerActor } from "../runtime/game-runtime";
import { orthogonalAdjacent } from "./targeting";
import type { TickEvent } from "./tick-events";

export function ordinarySlotCount(save: SaveState): number {
  return save.player.inventory.length;
}

export function itemQuantity(save: SaveState, itemId: string): number {
  const inPack = save.player.inventory.filter((row) => row.itemId === itemId).reduce((sum, row) => sum + row.quantity, 0);
  const inKeys = save.player.keyItems.filter((row) => row.itemId === itemId).reduce((sum, row) => sum + row.quantity, 0);
  const equipped = Object.values(save.player.equipment).filter((id) => id === itemId).length;
  return inPack + inKeys + equipped;
}

function mergeStack(rows: ItemStack[], itemId: string, quantity: number, maxStack: number): ItemStack[] | null {
  const next = rows.map((row) => ({ ...row }));
  let remaining = quantity;
  for (const row of next) {
    if (row.itemId !== itemId || row.quantity >= maxStack) {
      continue;
    }
    const room = maxStack - row.quantity;
    const take = Math.min(room, remaining);
    row.quantity += take;
    remaining -= take;
    if (remaining <= 0) {
      return next;
    }
  }
  while (remaining > 0) {
    if (next.length >= GLOBAL_CONSTANTS.ordinaryInventorySlots) {
      return null;
    }
    const take = Math.min(maxStack, remaining);
    next.push({ itemId, quantity: take });
    remaining -= take;
  }
  return next;
}

export function tryAddItem(save: SaveState, itemId: string, quantity: number): boolean {
  const item = CONTENT_REGISTRY.byId.item.get(itemId);
  if (!item || quantity <= 0) {
    return false;
  }
  if (item.kind === "currency") {
    save.player.currency += quantity;
    return true;
  }
  if (item.kind === "key") {
    const index = save.player.keyItems.findIndex((row) => row.itemId === itemId);
    if (index >= 0) {
      const existing = save.player.keyItems[index]!;
      save.player.keyItems[index] = { itemId, quantity: existing.quantity + quantity };
    } else {
      save.player.keyItems.push({ itemId, quantity });
    }
    return true;
  }
  const maxStack = item.stackSize > 0 ? item.stackSize : 1;
  const merged = mergeStack(save.player.inventory, itemId, quantity, maxStack);
  if (!merged) {
    return false;
  }
  save.player.inventory = merged;
  return true;
}

export function removeInventoryItem(save: SaveState, itemId: string, quantity = 1): boolean {
  const index = save.player.inventory.findIndex((row) => row.itemId === itemId && row.quantity > 0);
  if (index < 0) {
    return false;
  }
  const stack = save.player.inventory[index]!;
  if (stack.quantity < quantity) {
    return false;
  }
  if (stack.quantity === quantity) {
    save.player.inventory.splice(index, 1);
  } else {
    save.player.inventory[index] = { itemId: stack.itemId, quantity: stack.quantity - quantity };
  }
  return true;
}

function nextGroundId(save: SaveState, itemId: string): string {
  return `ground.${save.tick}.${itemId}.${save.groundItems.length}`;
}

export function dropInventoryItem(runtime: GameRuntime, itemId: string): TickEvent[] {
  const save = runtime.save;
  const player = playerActor(runtime);
  const item = CONTENT_REGISTRY.byId.item.get(itemId);
  if (!item) {
    return [{ type: "action_failed", actorId: player.id, detail: "unknown item" }];
  }
  if (item.kind === "key") {
    return [{ type: "action_failed", actorId: player.id, detail: "key items cannot be dropped" }];
  }
  if (item.kind === "currency") {
    return [{ type: "action_failed", actorId: player.id, detail: "currency is not dropped as an item" }];
  }
  if (!removeInventoryItem(save, itemId, 1)) {
    return [{ type: "action_failed", actorId: player.id, detail: "item not in inventory" }];
  }
  const ground: GroundItemState = {
    id: nextGroundId(save, itemId),
    itemId,
    quantity: 1,
    plane: { a: save.plane.a, b: save.plane.b },
    x: player.x,
    y: player.y,
  };
  save.groundItems.push(ground);
  return [{ type: "item_dropped", actorId: player.id, targetId: ground.id, detail: itemId, x: player.x, y: player.y }];
}

export function pickupGroundItem(runtime: GameRuntime, targetId?: string): TickEvent[] {
  const save = runtime.save;
  const player = playerActor(runtime);
  const neighbours = [{ x: player.x, y: player.y }, ...orthogonalAdjacent(player, runtime.currentPlaneBase.wraps)];
  const candidates = save.groundItems.filter(
    (row) => planesEqual(row.plane, save.plane) && neighbours.some((cell) => cell.x === row.x && cell.y === row.y),
  );
  const chosen = targetId ? candidates.find((row) => row.id === targetId) : candidates[0];
  if (!chosen) {
    return [{ type: "action_failed", actorId: player.id, detail: "no item" }];
  }
  if (!tryAddItem(save, chosen.itemId, chosen.quantity)) {
    return [{ type: "action_failed", actorId: player.id, detail: "inventory full" }];
  }
  save.groundItems = save.groundItems.filter((row) => row.id !== chosen.id);
  return [{ type: "item_picked_up", actorId: player.id, targetId: chosen.id, detail: chosen.itemId, x: chosen.x, y: chosen.y }];
}

export function equipItem(save: SaveState, itemId: string): { ok: true } | { ok: false; message: string } {
  const item = CONTENT_REGISTRY.byId.item.get(itemId);
  if (!item?.slot) {
    return { ok: false, message: "not equipment" };
  }
  if (!save.player.inventory.some((row) => row.itemId === itemId)) {
    return { ok: false, message: "item not in inventory" };
  }
  if (!removeInventoryItem(save, itemId, 1)) {
    return { ok: false, message: "item not in inventory" };
  }
  const occupied = save.player.equipment[item.slot];
  if (occupied) {
    if (!tryAddItem(save, occupied, 1)) {
      tryAddItem(save, itemId, 1);
      return { ok: false, message: "inventory full" };
    }
  }
  save.player.equipment = { ...save.player.equipment, [item.slot]: itemId };
  return { ok: true };
}

export function unequipSlot(save: SaveState, slot: EquipmentSlotId): { ok: true } | { ok: false; message: string } {
  const occupied = save.player.equipment[slot];
  if (!occupied) {
    return { ok: false, message: "slot empty" };
  }
  if (!tryAddItem(save, occupied, 1)) {
    return { ok: false, message: "inventory full" };
  }
  save.player.equipment = { ...save.player.equipment, [slot]: null };
  return { ok: true };
}

export function groundItemsOnPlane(save: SaveState, plane: SaveState["plane"]): GroundItemState[] {
  return save.groundItems.filter((row) => planesEqual(row.plane, plane));
}
