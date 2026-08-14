import {
  applyPlayerCommand,
  createAcceptedWorldCache,
  createNewGame,
  createRuntimeFromSaveRecord,
  formatTickEvent,
  getAvailableActions,
  getCharacterView,
  getHudView,
  getInventoryView,
  getVisiblePlaneView,
  advanceTick,
  makeSaveRecord,
  validateSaveRecord,
  type CommandResult,
  type GameRuntime,
  type HudView,
  type PlayerCommand,
  type TickResult,
} from "../core";
import { CORE_IDENTITY } from "../core/identity";
import type { InputIntent } from "../input/input-map";
import { PresentationFacade, ProceduralAudioProvider, ProceduralVisualProvider } from "../presentation";
import { MemoryPersistence, PersistenceQueue, type Persistence } from "../persistence";
import { playTickAudio } from "./audio-cues";
import { planeKey } from "../core/model/plane";

export interface GameSnapshot {
  readonly plane: ReturnType<typeof getVisiblePlaneView>;
  readonly hud: HudView;
  readonly inventory: ReturnType<typeof getInventoryView>;
  readonly character: ReturnType<typeof getCharacterView>;
}

export interface GameControllerOptions {
  readonly seed?: string;
  readonly presentation?: PresentationFacade;
  readonly persistence?: Persistence;
  readonly runtime?: GameRuntime;
}

const MAX_MESSAGES = 12;

export class GameController {
  readonly presentation: PresentationFacade;
  readonly persistence: Persistence;
  readonly queue: PersistenceQueue;
  runtime: GameRuntime;
  audioArmed = false;
  private messages: string[] = [];
  private lastEvents: TickResult["events"] = [];
  private musicKey: string | null = null;

  constructor(options: GameControllerOptions = {}) {
    this.presentation = options.presentation ?? new PresentationFacade(new ProceduralVisualProvider(), new ProceduralAudioProvider());
    this.persistence = options.persistence ?? new MemoryPersistence();
    this.queue = new PersistenceQueue(this.persistence);
    this.runtime = options.runtime ?? createNewGame(CORE_IDENTITY.generatorVersion, options.seed ?? "0", {
      cache: createAcceptedWorldCache(),
    });
  }

  static async open(options: GameControllerOptions & { readonly forceNew?: boolean } = {}): Promise<GameController> {
    const persistence = options.persistence ?? new MemoryPersistence();
    const presentation = options.presentation ?? new PresentationFacade(new ProceduralVisualProvider(), new ProceduralAudioProvider());
    const prefs = await persistence.getPreferences();
    if (prefs) {
      presentation.setAudioPreferences(prefs.audio);
    }
    if (!options.forceNew) {
      const stored = await persistence.getSave();
      if (stored) {
        const valid = validateSaveRecord(stored);
        if (!valid.ok) {
          throw new Error(`${valid.code}: ${valid.message}`);
        }
        const loaded = createRuntimeFromSaveRecord(valid.record, { cache: createAcceptedWorldCache() });
        if (!loaded.ok) {
          throw new Error(`${loaded.code}: ${loaded.message}`);
        }
        return new GameController({ presentation, persistence, runtime: loaded.runtime });
      }
    }
    const controller = new GameController({
      presentation,
      persistence,
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
    });
    await controller.persist();
    return controller;
  }

  command(command: PlayerCommand): CommandResult {
    const result = applyPlayerCommand(this.runtime, command);
    if (result.ok && command.type !== "setHeldDirection" && command.type !== "queue" && command.type !== "queueFromModal") {
      void this.persist();
    }
    return result;
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
    if (intent.type === "inventory") {
      return this.command({ type: "openModal", modal: "inventory" });
    }
    if (intent.type === "character") {
      return this.command({ type: "openModal", modal: "character" });
    }
    if (intent.type === "legend") {
      return this.command({ type: "openModal", modal: "legend" });
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
    if (intent.type === "pickup") {
      return this.command({ type: "queue", action: { type: "pickup" } });
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
    if (result.advanced) {
      void this.persist();
    }
    return result;
  }

  async resumeAudio(): Promise<void> {
    await this.presentation.resume();
    this.audioArmed = true;
    this.syncMusic(true);
  }

  async persist(): Promise<void> {
    await this.queue.enqueue(makeSaveRecord(this.runtime.save, new Date().toISOString()));
  }

  async clearGenerationCache(): Promise<void> {
    await this.persistence.clearCache();
  }

  snapshot(): GameSnapshot {
    return {
      plane: getVisiblePlaneView(this.runtime, this.lastEvents),
      hud: getHudView(this.runtime, this.messages),
      inventory: getInventoryView(this.runtime),
      character: getCharacterView(this.runtime),
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
