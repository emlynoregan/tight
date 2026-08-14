import {
  applyPlayerCommand,
  createAcceptedWorldCache,
  createNewGame,
  formatTickEvent,
  getAvailableActions,
  getHudView,
  getVisiblePlaneView,
  advanceTick,
  type CommandResult,
  type GameRuntime,
  type HudView,
  type PlaneView,
  type PlayerCommand,
  type TickResult,
} from "../core";
import { CORE_IDENTITY } from "../core/identity";
import type { InputIntent } from "../input/input-map";
import { PresentationFacade, ProceduralAudioProvider, ProceduralVisualProvider } from "../presentation";
import { playTickAudio } from "./audio-cues";
import { planeKey } from "../core/model/plane";

export interface GameSnapshot {
  readonly plane: PlaneView;
  readonly hud: HudView;
}

export interface GameControllerOptions {
  readonly seed?: string;
  readonly presentation?: PresentationFacade;
}

const MAX_MESSAGES = 12;

export class GameController {
  readonly presentation: PresentationFacade;
  runtime: GameRuntime;
  audioArmed = false;
  private messages: string[] = [];
  private lastEvents: TickResult["events"] = [];
  private musicKey: string | null = null;

  constructor(options: GameControllerOptions = {}) {
    this.presentation = options.presentation ?? new PresentationFacade(new ProceduralVisualProvider(), new ProceduralAudioProvider());
    this.runtime = createNewGame(CORE_IDENTITY.generatorVersion, options.seed ?? "0", {
      cache: createAcceptedWorldCache(),
    });
  }

  command(command: PlayerCommand): CommandResult {
    return applyPlayerCommand(this.runtime, command);
  }

  handleIntent(intent: InputIntent): CommandResult | null {
    if (intent.type === "holdDirection") {
      return this.command({ type: "setHeldDirection", direction: intent.direction });
    }
    if (intent.type === "clearHold") {
      return this.command({ type: "setHeldDirection", direction: null });
    }
    if (intent.type === "closeModal") {
      return this.command({ type: "closeModal" });
    }
    if (this.runtime.save.modal) {
      return { ok: false, code: "rejected", message: "simulation paused" };
    }
    if (intent.type === "wait") {
      return this.command({ type: "queue", action: { type: "wait" } });
    }
    if (intent.type === "interact") {
      return this.command({ type: "queue", action: { type: "interact" } });
    }
    if (intent.type === "attack") {
      const attack = getAvailableActions(this.runtime).defaultAttack;
      if (!attack) {
        return { ok: false, code: "rejected", message: "no adjacent target" };
      }
      return this.command({ type: "queue", action: attack });
    }
    return null;
  }

  tick(): TickResult {
    const result = advanceTick(this.runtime);
    this.lastEvents = result.events;
    for (const event of result.events) {
      const line = formatTickEvent(event);
      if (line) {
        this.messages.push(line);
      }
    }
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    if (this.audioArmed) {
      playTickAudio(this.presentation, result.events);
      this.syncMusic();
    }
    return result;
  }

  async resumeAudio(): Promise<void> {
    await this.presentation.resume();
    this.audioArmed = true;
    this.syncMusic(true);
  }

  snapshot(): GameSnapshot {
    return {
      plane: getVisiblePlaneView(this.runtime, this.lastEvents),
      hud: getHudView(this.runtime, this.messages),
    };
  }

  private syncMusic(force = false): void {
    const key = planeKey(this.runtime.save.plane);
    if (!force && key === this.musicKey) {
      return;
    }
    this.musicKey = key;
    this.presentation.startMusic({ plane: this.runtime.save.plane });
  }
}
