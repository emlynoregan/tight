import { GLOBAL_CONSTANTS } from "../model/constants";
import type { AttributeId, EquipmentSlotId } from "../model/ids";
import type { Direction, IntentionalAction, SaveState } from "../model/save-state";
import { DIRECTIONS } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { playerActor } from "../runtime/game-runtime";
import { spendAdvancementPoint } from "./advancement";
import { resolveItemAction } from "./combat";
import { dropInventoryItem, equipItem, unequipSlot } from "./inventory";

export type PlayerCommand =
  | { readonly type: "queue"; readonly action: IntentionalAction }
  | { readonly type: "setHeldDirection"; readonly direction: Direction | null }
  | { readonly type: "openModal"; readonly modal: string }
  | { readonly type: "closeModal" }
  | { readonly type: "equip"; readonly itemId: string }
  | { readonly type: "unequip"; readonly slot: EquipmentSlotId }
  | { readonly type: "modalDrop"; readonly itemId: string }
  | { readonly type: "modalUse"; readonly itemId: string }
  | { readonly type: "spendAp"; readonly attribute: AttributeId };

export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "rejected"; readonly message: string };

function isDirection(value: string | undefined): value is Direction {
  return value !== undefined && (DIRECTIONS as readonly string[]).includes(value);
}

export function isWellFormedAction(action: IntentionalAction): boolean {
  if (action.type === "wait") {
    return action.direction === undefined;
  }
  if (action.type === "move") {
    return isDirection(action.direction);
  }
  if (action.type === "thrust") {
    return isDirection(action.direction);
  }
  if (action.type === "interact") {
    return action.direction === undefined;
  }
  if (action.type === "attack") {
    return typeof action.attackId === "string" && action.attackId.length > 0;
  }
  if (action.type === "ability") {
    return typeof action.abilityId === "string" && action.abilityId.length > 0;
  }
  if (action.type === "item") {
    return typeof action.itemId === "string" && action.itemId.length > 0;
  }
  if (action.type === "pickup") {
    return true;
  }
  if (action.type === "drop") {
    return typeof action.itemId === "string" && action.itemId.length > 0;
  }
  return false;
}

function applyPausedMutation(runtime: GameRuntime, command: PlayerCommand): CommandResult {
  if (command.type === "equip") {
    const result = equipItem(runtime.save, command.itemId);
    return result.ok ? { ok: true } : { ok: false, code: "rejected", message: result.message };
  }
  if (command.type === "unequip") {
    const result = unequipSlot(runtime.save, command.slot);
    return result.ok ? { ok: true } : { ok: false, code: "rejected", message: result.message };
  }
  if (command.type === "modalDrop") {
    const events = dropInventoryItem(runtime, command.itemId);
    const failed = events.find((event) => event.type === "action_failed");
    return failed ? { ok: false, code: "rejected", message: failed.detail ?? "drop failed" } : { ok: true };
  }
  if (command.type === "modalUse") {
    const events = resolveItemAction(runtime.save, runtime.currentPlaneBase, playerActor(runtime), {
      type: "item",
      itemId: command.itemId,
    });
    const failed = events.find((event) => event.type === "action_failed");
    return failed ? { ok: false, code: "rejected", message: failed.detail ?? "use failed" } : { ok: true };
  }
  if (command.type === "spendAp") {
    const result = spendAdvancementPoint(runtime, command.attribute);
    return result.ok ? { ok: true } : { ok: false, code: "rejected", message: result.message };
  }
  return { ok: false, code: "rejected", message: "unknown paused command" };
}

export function applyPlayerCommand(runtime: GameRuntime, command: PlayerCommand): CommandResult {
  const save = runtime.save;
  if (command.type === "closeModal") {
    save.modal = null;
    return { ok: true };
  }
  if (command.type === "openModal") {
    save.modal = command.modal;
    return { ok: true };
  }
  if (command.type === "setHeldDirection") {
    if (command.direction !== null && !isDirection(command.direction)) {
      return { ok: false, code: "rejected", message: "invalid direction" };
    }
    save.heldDirectionChanged = command.direction !== save.heldDirection;
    save.heldDirection = command.direction;
    return { ok: true };
  }
  if (
    command.type === "equip" ||
    command.type === "unequip" ||
    command.type === "modalDrop" ||
    command.type === "modalUse" ||
    command.type === "spendAp"
  ) {
    if (!save.modal) {
      return { ok: false, code: "rejected", message: "management commands require a paused modal" };
    }
    return applyPausedMutation(runtime, command);
  }
  if (save.modal) {
    return { ok: false, code: "rejected", message: "simulation paused" };
  }
  if (command.type !== "queue" || !isWellFormedAction(command.action)) {
    return { ok: false, code: "rejected", message: "command is not a legal action" };
  }
  if (save.actionQueue.length >= GLOBAL_CONSTANTS.inputQueueCapacity) {
    return { ok: false, code: "rejected", message: "action queue is full" };
  }
  save.actionQueue.push(command.action);
  return { ok: true };
}

export function capturePlayerAction(save: SaveState): IntentionalAction {
  const queued = save.actionQueue.shift();
  if (queued) {
    save.heldDirectionChanged = false;
    return queued;
  }
  const direction = save.heldDirection;
  save.heldDirectionChanged = false;
  if (direction) {
    return { type: "move", direction };
  }
  return { type: "wait" };
}
