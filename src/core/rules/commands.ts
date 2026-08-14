import { GLOBAL_CONSTANTS } from "../model/constants";
import type { Direction, IntentionalAction, SaveState } from "../model/save-state";
import { DIRECTIONS } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";

export type PlayerCommand =
  | { readonly type: "queue"; readonly action: IntentionalAction }
  | { readonly type: "setHeldDirection"; readonly direction: Direction | null }
  | { readonly type: "openModal"; readonly modal: string }
  | { readonly type: "closeModal" };

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
  return false;
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
  if (save.modal) {
    return { ok: false, code: "rejected", message: "simulation paused" };
  }
  if (!isWellFormedAction(command.action)) {
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
