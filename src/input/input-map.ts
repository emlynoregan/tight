import type { Direction } from "../core/model/save-state";

export type InputIntent =
  | { readonly type: "holdDirection"; readonly direction: Direction }
  | { readonly type: "clearHold" }
  | { readonly type: "wait" }
  | { readonly type: "interact" }
  | { readonly type: "attack" }
  | { readonly type: "pickup" }
  | { readonly type: "inventory" }
  | { readonly type: "character" }
  | { readonly type: "legend" }
  | { readonly type: "questLog" }
  | { readonly type: "settings" }
  | { readonly type: "closeModal" };

const DIRECTION_BY_CODE: Record<string, Direction> = {
  ArrowUp: "north",
  ArrowRight: "east",
  ArrowDown: "south",
  ArrowLeft: "west",
  KeyW: "north",
  KeyD: "east",
  KeyS: "south",
  KeyA: "west",
};

export function directionForCode(code: string): Direction | null {
  return DIRECTION_BY_CODE[code] ?? null;
}

export function mapKeydown(code: string, repeat: boolean): InputIntent | null {
  const direction = directionForCode(code);
  if (direction) {
    if (repeat) {
      return null;
    }
    return { type: "holdDirection", direction };
  }
  if (repeat) {
    return null;
  }
  if (code === "Space" || code === "Period") {
    return { type: "wait" };
  }
  if (code === "KeyE") {
    return { type: "interact" };
  }
  if (code === "KeyF") {
    return { type: "attack" };
  }
  if (code === "KeyG") {
    return { type: "pickup" };
  }
  if (code === "KeyI") {
    return { type: "inventory" };
  }
  if (code === "KeyC") {
    return { type: "character" };
  }
  if (code === "KeyL") {
    return { type: "legend" };
  }
  if (code === "KeyJ") {
    return { type: "questLog" };
  }
  if (code === "KeyO") {
    return { type: "settings" };
  }
  if (code === "Escape") {
    return { type: "closeModal" };
  }
  return null;
}

export function mapKeyup(code: string): InputIntent | null {
  const direction = directionForCode(code);
  if (!direction) {
    return null;
  }
  return { type: "holdDirection", direction };
}

export const GAME_KEY_CODES = new Set([
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "Period",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyI",
  "KeyC",
  "KeyL",
  "KeyJ",
  "KeyO",
  "Escape",
]);
