import { GLOBAL_CONSTANTS } from "../model/constants";
import type { AttributeId, EquipmentSlotId } from "../model/ids";
import type { Direction, IntentionalAction, SaveState } from "../model/save-state";
import { DIRECTIONS } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { spendAdvancementPoint } from "./advancement";
import { chooseDialogue } from "./dialogue";
import { equipItem, unequipSlot } from "./inventory";
import { buyShopSource, sellItem } from "./shops";
import type { TickEvent } from "./tick-events";

export type PlayerCommand =
  | { readonly type: "queue"; readonly action: IntentionalAction }
  | { readonly type: "queueFromModal"; readonly action: IntentionalAction }
  | { readonly type: "setHeldDirection"; readonly direction: Direction | null }
  | { readonly type: "openModal"; readonly modal: string }
  | { readonly type: "closeModal" }
  | { readonly type: "equip"; readonly itemId: string }
  | { readonly type: "unequip"; readonly slot: EquipmentSlotId }
  | { readonly type: "spendAp"; readonly attribute: AttributeId }
  | { readonly type: "dialogueChoice"; readonly choiceId: string }
  | { readonly type: "buy"; readonly sourceId: string }
  | { readonly type: "sell"; readonly itemId: string }
  | { readonly type: "newGame" };

export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "rejected"; readonly message: string };

const LIFECYCLE_MODALS = new Set(["victory", "confirm-new-game", "confirm-import"]);

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
  if (command.type === "spendAp") {
    const result = spendAdvancementPoint(runtime, command.attribute);
    return result.ok ? { ok: true } : { ok: false, code: "rejected", message: result.message };
  }
  if (command.type === "dialogueChoice") {
    const events: TickEvent[] = [];
    const ok = chooseDialogue(runtime, command.choiceId, events);
    return ok ? { ok: true } : { ok: false, code: "rejected", message: "illegal dialogue choice" };
  }
  if (command.type === "buy") {
    const events: TickEvent[] = [];
    const ok = buyShopSource(runtime, command.sourceId, events);
    return ok ? { ok: true } : { ok: false, code: "rejected", message: "cannot buy" };
  }
  if (command.type === "sell") {
    const events: TickEvent[] = [];
    const ok = sellItem(runtime, command.itemId, events);
    return ok ? { ok: true } : { ok: false, code: "rejected", message: "cannot sell" };
  }
  return { ok: false, code: "rejected", message: "unknown paused command" };
}

function enqueueAction(save: SaveState, action: IntentionalAction): CommandResult {
  if (!isWellFormedAction(action)) {
    return { ok: false, code: "rejected", message: "command is not a legal action" };
  }
  if (save.actionQueue.length >= GLOBAL_CONSTANTS.inputQueueCapacity) {
    return { ok: false, code: "rejected", message: "action queue is full" };
  }
  save.actionQueue.push(action);
  return { ok: true };
}

export function applyPlayerCommand(runtime: GameRuntime, command: PlayerCommand): CommandResult {
  const save = runtime.save;
  if (command.type === "closeModal") {
    if (save.modal === "confirm-new-game") {
      save.modal = "victory";
      return { ok: true };
    }
    save.modal = null;
    return { ok: true };
  }
  if (command.type === "newGame") {
    if (save.modal === "victory") {
      save.modal = "confirm-new-game";
      return { ok: true };
    }
    return { ok: false, code: "rejected", message: "new game requires confirmation" };
  }
  if (command.type === "openModal") {
    if (save.modal && LIFECYCLE_MODALS.has(save.modal)) {
      return { ok: false, code: "rejected", message: "simulation paused" };
    }
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
  if (command.type === "equip" || command.type === "unequip" || command.type === "spendAp" || command.type === "dialogueChoice" || command.type === "buy" || command.type === "sell") {
    if (!save.modal) {
      return { ok: false, code: "rejected", message: "management commands require a paused modal" };
    }
    if (LIFECYCLE_MODALS.has(save.modal)) {
      return { ok: false, code: "rejected", message: "simulation paused" };
    }
    return applyPausedMutation(runtime, command);
  }
  if (command.type === "queueFromModal") {
    if (!save.modal) {
      return { ok: false, code: "rejected", message: "management commands require a paused modal" };
    }
    if (LIFECYCLE_MODALS.has(save.modal)) {
      return { ok: false, code: "rejected", message: "simulation paused" };
    }
    const queued = enqueueAction(save, command.action);
    if (!queued.ok) {
      return queued;
    }
    save.modal = null;
    return { ok: true };
  }
  if (save.modal) {
    return { ok: false, code: "rejected", message: "simulation paused" };
  }
  if (command.type !== "queue") {
    return { ok: false, code: "rejected", message: "command is not a legal action" };
  }
  return enqueueAction(save, command.action);
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
