import { CONTENT_REGISTRY } from "../data/registry";
import type { EquipmentSlotId } from "../model/ids";
import type { EquipmentLoadout, ItemStack } from "../model/save-state";
import { ordinarySlotCount } from "../rules/inventory";
import { playerAtSafeAnchor } from "../rules/advancement";
import { playerActor, type GameRuntime } from "../runtime/game-runtime";
import { GLOBAL_CONSTANTS } from "../model/constants";

export interface InventorySlotView {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly kind: string;
  readonly usable: boolean;
  readonly equippable: boolean;
  readonly slot: EquipmentSlotId | null;
}

export interface InventoryView {
  readonly slotsUsed: number;
  readonly slotsMax: number;
  readonly currency: number;
  readonly inventory: readonly InventorySlotView[];
  readonly keyItems: readonly InventorySlotView[];
  readonly equipment: EquipmentLoadout;
  readonly equipmentNames: Readonly<Record<EquipmentSlotId, string | null>>;
}

function stackView(stack: ItemStack): InventorySlotView {
  const item = CONTENT_REGISTRY.byId.item.get(stack.itemId);
  return {
    itemId: stack.itemId,
    name: item?.name ?? stack.itemId,
    quantity: stack.quantity,
    kind: item?.kind ?? "unknown",
    usable: Boolean(item?.useAbilityId),
    equippable: item?.slot !== null && item?.slot !== undefined,
    slot: item?.slot ?? null,
  };
}

export function getInventoryView(runtime: GameRuntime): InventoryView {
  const save = runtime.save;
  const names = {} as Record<EquipmentSlotId, string | null>;
  for (const slot of Object.keys(save.player.equipment) as EquipmentSlotId[]) {
    const id = save.player.equipment[slot];
    names[slot] = id ? (CONTENT_REGISTRY.byId.item.get(id)?.name ?? id) : null;
  }
  return {
    slotsUsed: ordinarySlotCount(save),
    slotsMax: GLOBAL_CONSTANTS.ordinaryInventorySlots,
    currency: save.player.currency,
    inventory: save.player.inventory.map(stackView),
    keyItems: save.player.keyItems.map(stackView),
    equipment: { ...save.player.equipment },
    equipmentNames: names,
  };
}

export interface CharacterView {
  readonly attributes: Readonly<Record<string, number>>;
  readonly unspentAp: number;
  readonly atSafeAnchor: boolean;
  readonly attributeCap: number;
}

export function getCharacterView(runtime: GameRuntime): CharacterView {
  return {
    attributes: { ...runtime.save.player.attributes },
    unspentAp: runtime.save.player.unspentAp,
    atSafeAnchor: playerAtSafeAnchor(runtime),
    attributeCap: GLOBAL_CONSTANTS.permanentAttributeCap,
  };
}

export function playerHasGroundItem(runtime: GameRuntime): boolean {
  const player = playerActor(runtime);
  return runtime.save.groundItems.some((row) => row.plane.a === runtime.save.plane.a && row.plane.b === runtime.save.plane.b && row.x === player.x && row.y === player.y);
}
