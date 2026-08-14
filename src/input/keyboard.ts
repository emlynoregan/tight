import type { Direction } from "../core/model/save-state";
import { GAME_KEY_CODES, directionForCode, mapKeydown, type InputIntent } from "./input-map";

export type IntentListener = (intent: InputIntent) => void;

/**
 * Translates browser keyboard events into intents.
 * Key repeat never becomes a queued action; held movement is a single continuing direction.
 */
export class KeyboardAdapter {
  private readonly held: Direction[] = [];
  private readonly listener: IntentListener;
  private readonly onDown: (event: KeyboardEvent) => void;
  private readonly onUp: (event: KeyboardEvent) => void;

  constructor(target: Window, listener: IntentListener) {
    this.listener = listener;
    this.onDown = (event) => this.handleKeydown(event);
    this.onUp = (event) => this.handleKeyup(event);
    target.addEventListener("keydown", this.onDown);
    target.addEventListener("keyup", this.onUp);
  }

  currentHeld(): Direction | null {
    return this.held[this.held.length - 1] ?? null;
  }

  dispose(target: Window): void {
    target.removeEventListener("keydown", this.onDown);
    target.removeEventListener("keyup", this.onUp);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!GAME_KEY_CODES.has(event.code)) {
      return;
    }
    event.preventDefault();
    const intent = mapKeydown(event.code, event.repeat);
    if (!intent) {
      return;
    }
    if (intent.type === "holdDirection") {
      this.pushHeld(intent.direction);
      this.listener({ type: "holdDirection", direction: this.currentHeld() ?? intent.direction });
      return;
    }
    this.listener(intent);
  }

  private handleKeyup(event: KeyboardEvent): void {
    const direction = directionForCode(event.code);
    if (!direction) {
      return;
    }
    event.preventDefault();
    this.held.splice(
      0,
      this.held.length,
      ...this.held.filter((row) => row !== direction),
    );
    const remaining = this.currentHeld();
    if (remaining) {
      this.listener({ type: "holdDirection", direction: remaining });
      return;
    }
    this.listener({ type: "clearHold" });
  }

  private pushHeld(direction: Direction): void {
    const next = this.held.filter((row) => row !== direction);
    next.push(direction);
    this.held.splice(0, this.held.length, ...next);
  }
}
