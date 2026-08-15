import {
  applyPlayerCommand,
  CONTENT_REGISTRY,
  createAcceptedWorldCache,
  createMonsterActor,
  createNewGame,
  createRuntimeFromSaveRecord,
  formatTickEvent,
  getAvailableActions,
  getCharacterView,
  getDialogueView,
  getHudView,
  getInventoryView,
  getQuestLogView,
  getShopView,
  getVisiblePlaneView,
  advanceTick,
  makeSaveRecord,
  OLYMPUS_PLANE,
  parseSaveJson,
  playerActor,
  switchCurrentPlane,
  validateSaveRecord,
  type CommandResult,
  type GameRuntime,
  type HudView,
  type PlayerCommand,
  type SaveRecord,
  type TickResult,
} from "../core";
import { CORE_IDENTITY } from "../core/identity";
import { planeKey, planesEqual } from "../core/model/plane";
import { DIRECTION_DELTA } from "../core/model/save-state";
import { canOccupy } from "../core/rules/occupancy";
import { transitionById } from "../core/rules/transitions";
import type { InputIntent } from "../input/input-map";
import { PresentationFacade, ProceduralAudioProvider, ProceduralVisualProvider } from "../presentation";
import {
  defaultPreferences,
  MemoryPersistence,
  normalizePreferences,
  PersistenceQueue,
  type Persistence,
  type StoredPreferences,
} from "../persistence";
import { playTickAudio } from "./audio-cues";
import { APP_VERSION } from "./build-info";
import { diagnosticsFromRuntime, type GameDiagnostics } from "./diagnostics";

export interface GameSnapshot {
  readonly plane: ReturnType<typeof getVisiblePlaneView>;
  readonly hud: HudView;
  readonly inventory: ReturnType<typeof getInventoryView>;
  readonly character: ReturnType<typeof getCharacterView>;
  readonly dialogue: ReturnType<typeof getDialogueView>;
  readonly shop: ReturnType<typeof getShopView>;
  readonly quests: ReturnType<typeof getQuestLogView>;
  readonly settings: SettingsView;
}

export interface SettingsView {
  readonly worldSeed: string;
  readonly generatorVersion: string;
  readonly appVersion: string;
  readonly topologyHash: string;
  readonly plane: string;
  readonly tick: number;
  readonly audioEnabled: boolean;
  readonly reducedShake: boolean;
  readonly reducedFlash: boolean;
  readonly persistError: string | null;
  readonly storageWarning: string | null;
  readonly pendingNewGameSeed: string | null;
  readonly pendingImportSeed: string | null;
}

export interface GameControllerOptions {
  readonly seed?: string;
  readonly presentation?: PresentationFacade;
  readonly persistence?: Persistence;
  readonly runtime?: GameRuntime;
  readonly prefersReducedMotion?: boolean;
  readonly storageWarning?: string | null;
}

const MAX_MESSAGES = 12;

function fail(message: string): CommandResult {
  return { ok: false, code: "rejected", message };
}

export class GameController {
  readonly presentation: PresentationFacade;
  readonly persistence: Persistence;
  readonly queue: PersistenceQueue;
  runtime: GameRuntime;
  audioArmed = false;
  prefs: StoredPreferences;
  persistError: string | null = null;
  readonly storageWarning: string | null;
  pendingNewGameSeed: string | null = null;
  pendingReturnModal: string | null = null;
  pendingImport: SaveRecord | null = null;
  private messages: string[] = [];
  private lastEvents: TickResult["events"] = [];
  private musicKey: string | null = null;

  constructor(options: GameControllerOptions = {}) {
    this.presentation = options.presentation ?? new PresentationFacade(new ProceduralVisualProvider(), new ProceduralAudioProvider());
    this.persistence = options.persistence ?? new MemoryPersistence();
    this.queue = new PersistenceQueue(this.persistence, (error) => {
      this.persistError = error instanceof Error ? error.message : "Save could not be written.";
    });
    this.runtime = options.runtime ?? createNewGame(CORE_IDENTITY.generatorVersion, options.seed ?? "0", {
      cache: createAcceptedWorldCache(),
    });
    this.prefs = defaultPreferences(options.prefersReducedMotion === true);
    this.storageWarning = options.storageWarning ?? null;
    this.presentation.setAudioPreferences(this.prefs.audio);
  }

  static async open(options: GameControllerOptions & { readonly forceNew?: boolean } = {}): Promise<GameController> {
    const persistence = options.persistence ?? new MemoryPersistence();
    const presentation = options.presentation ?? new PresentationFacade(new ProceduralVisualProvider(), new ProceduralAudioProvider());
    const prefersReducedMotion = options.prefersReducedMotion === true;
    const storedPrefs = normalizePreferences(await persistence.getPreferences(), prefersReducedMotion);
    presentation.setAudioPreferences(storedPrefs.audio);
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
        const controller = new GameController({
          presentation,
          persistence,
          runtime: loaded.runtime,
          prefersReducedMotion,
          ...(options.storageWarning !== undefined ? { storageWarning: options.storageWarning } : {}),
        });
        controller.prefs = storedPrefs;
        controller.presentation.setAudioPreferences(storedPrefs.audio);
        return controller;
      }
    }
    const controller = new GameController({
      presentation,
      persistence,
      prefersReducedMotion,
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      ...(options.storageWarning !== undefined ? { storageWarning: options.storageWarning } : {}),
    });
    controller.prefs = storedPrefs;
    controller.presentation.setAudioPreferences(storedPrefs.audio);
    await controller.persist();
    await controller.persistPreferences();
    return controller;
  }

  command(command: PlayerCommand): CommandResult {
    if (command.type === "closeModal" && this.isConfirmModal() && this.pendingReturnModal !== null) {
      this.runtime.save.modal = this.pendingReturnModal === "" ? null : this.pendingReturnModal;
      this.clearPendingLifecycle();
      void this.persist();
      return { ok: true };
    }
    if (command.type === "newGame" && this.runtime.save.modal === "confirm-new-game") {
      this.resetToNewGame(this.pendingNewGameSeed ?? this.runtime.save.worldSeed);
      this.clearPendingLifecycle();
      void this.persist();
      return { ok: true };
    }
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
      if (this.runtime.save.modal) {
        return this.command({ type: "closeModal" });
      }
      return this.command({ type: "openModal", modal: "settings" });
    }
    if (intent.type === "settings") {
      if (this.runtime.save.modal === "settings") {
        return this.command({ type: "closeModal" });
      }
      return this.command({ type: "openModal", modal: "settings" });
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
    if (intent.type === "questLog") {
      return this.command({ type: "openModal", modal: "questlog" });
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

  requestNewGame(seed: string): CommandResult {
    const trimmed = seed.trim();
    if (!trimmed) {
      return fail("seed is required");
    }
    this.pendingNewGameSeed = trimmed;
    if (this.runtime.save.modal === "victory") {
      this.pendingReturnModal = "victory";
      return this.command({ type: "newGame" });
    }
    this.pendingReturnModal = this.runtime.save.modal ?? "";
    this.runtime.save.modal = "confirm-new-game";
    return { ok: true };
  }

  exportSaveJson(): string {
    return JSON.stringify(makeSaveRecord(this.runtime.save, new Date().toISOString()), null, 2);
  }

  requestImport(text: string): CommandResult {
    const parsed = parseSaveJson(text);
    if (!parsed.ok) {
      return fail(`${parsed.code}: ${parsed.message}`);
    }
    const loaded = createRuntimeFromSaveRecord(parsed.record, { cache: createAcceptedWorldCache() });
    if (!loaded.ok) {
      return fail(`${loaded.code}: ${loaded.message}`);
    }
    this.pendingImport = parsed.record;
    this.pendingReturnModal = this.runtime.save.modal ?? "settings";
    this.runtime.save.modal = "confirm-import";
    return { ok: true };
  }

  confirmImport(): CommandResult {
    if (!this.pendingImport) {
      return fail("no imported save waiting");
    }
    const loaded = createRuntimeFromSaveRecord(this.pendingImport, { cache: createAcceptedWorldCache() });
    if (!loaded.ok) {
      return fail(`${loaded.code}: ${loaded.message}`);
    }
    this.runtime = loaded.runtime;
    this.messages = [];
    this.lastEvents = [];
    this.musicKey = null;
    this.clearPendingLifecycle();
    if (this.audioArmed) {
      this.syncMusic(true);
    }
    void this.persist();
    return { ok: true };
  }

  async setPreferences(patch: Partial<StoredPreferences> & { readonly audioEnabled?: boolean }): Promise<void> {
    const audio = {
      ...this.prefs.audio,
      ...(patch.audio ?? {}),
      ...(patch.audioEnabled !== undefined ? { enabled: patch.audioEnabled } : {}),
    };
    this.prefs = {
      audio,
      reducedShake: patch.reducedShake ?? this.prefs.reducedShake,
      reducedFlash: patch.reducedFlash ?? this.prefs.reducedFlash,
    };
    this.presentation.setAudioPreferences(this.prefs.audio);
    if (!this.prefs.audio.enabled) {
      this.presentation.stopMusic();
    } else if (this.audioArmed) {
      this.syncMusic(true);
    }
    await this.persistPreferences();
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
    if (this.prefs.audio.enabled) {
      this.syncMusic(true);
    }
  }

  async persist(): Promise<void> {
    try {
      await this.queue.enqueue(makeSaveRecord(this.runtime.save, new Date().toISOString()));
      this.persistError = null;
    } catch (error) {
      this.persistError = error instanceof Error ? error.message : "Save could not be written.";
    }
  }

  async persistPreferences(): Promise<void> {
    try {
      await this.persistence.putPreferences(this.prefs);
    } catch (error) {
      this.persistError = error instanceof Error ? error.message : "Preferences could not be written.";
    }
  }

  async clearGenerationCache(): Promise<void> {
    await this.persistence.clearCache();
  }

  diagnostics(errorCode = "OK", errorMessage = ""): GameDiagnostics {
    return diagnosticsFromRuntime(this.runtime, errorCode, errorMessage);
  }

  debugDefeatOlympus(): TickResult {
    const plane = switchCurrentPlane(this.runtime, OLYMPUS_PLANE);
    if (!plane) {
      throw new Error("UNREALIZABLE_PLANE: olympus could not be loaded");
    }
    const player = playerActor(this.runtime);
    player.plane = { ...OLYMPUS_PLANE };
    const entry = plane.namedPoints.find((point) => point.kind === "playerEntry") ?? plane.namedPoints[0];
    if (entry) {
      player.x = entry.x;
      player.y = entry.y;
    }
    const boss = this.runtime.save.actors.find((actor) => actor.id === CONTENT_REGISTRY.victory.actorId);
    if (!boss) {
      throw new Error("INVALID_SAVE: olympus boss missing");
    }
    boss.hp = 0;
    return this.tick();
  }

  debugStandAtInteractExit(): { readonly fromPlane: string; readonly destinationPlane: string } {
    const player = playerActor(this.runtime);
    const plane = this.runtime.currentPlaneBase;
    for (const fixture of plane.transitionFixtures) {
      const transition = transitionById(this.runtime, fixture.transitionId);
      if (!transition || !planesEqual(transition.sourcePlane, plane.plane)) {
        continue;
      }
      if (transition.initiallyBroken || transition.progressionClass === "optional_broken") {
        continue;
      }
      if (transition.gateId) {
        continue;
      }
      const archetype = CONTENT_REGISTRY.byId.transition.get(transition.archetypeId);
      if (archetype?.activation !== "interact") {
        continue;
      }
      const standOn = { x: fixture.x, y: fixture.y };
      if (!canOccupy(plane, this.runtime.save.actors, standOn, player.id, this.runtime.save)) {
        continue;
      }
      player.x = standOn.x;
      player.y = standOn.y;
      this.runtime.save.heldDirection = null;
      this.runtime.save.actionQueue = [];
      return {
        fromPlane: planeKey(this.runtime.save.plane),
        destinationPlane: planeKey(transition.destinationPlane),
      };
    }
    throw new Error("UNREALIZABLE_PLANE: no interact-activated open exit on the current plane");
  }

  debugPlaceAdjacentHostile(): { readonly monsterId: string; readonly hp: number } {
    const player = playerActor(this.runtime);
    for (const delta of Object.values(DIRECTION_DELTA)) {
      const cell = { x: player.x + delta.x, y: player.y + delta.y };
      if (!canOccupy(this.runtime.currentPlaneBase, this.runtime.save.actors, cell, "rat.qa", this.runtime.save)) {
        continue;
      }
      const rat = createMonsterActor("rat.qa", "rat", this.runtime.save.plane, cell.x, cell.y);
      this.runtime.save.actors.push(rat);
      this.runtime.save.heldDirection = null;
      this.runtime.save.actionQueue = [];
      return { monsterId: rat.id, hp: rat.hp };
    }
    throw new Error("UNREALIZABLE_PLANE: no adjacent open cell for a hostile");
  }

  snapshot(): GameSnapshot {
    return {
      plane: getVisiblePlaneView(this.runtime, this.lastEvents),
      hud: getHudView(this.runtime, this.messages),
      inventory: getInventoryView(this.runtime),
      character: getCharacterView(this.runtime),
      dialogue: getDialogueView(this.runtime),
      shop: getShopView(this.runtime),
      quests: getQuestLogView(this.runtime),
      settings: {
        worldSeed: this.runtime.save.worldSeed,
        generatorVersion: this.runtime.save.generatorVersion,
        appVersion: APP_VERSION,
        topologyHash: this.runtime.save.topologyHash,
        plane: planeKey(this.runtime.save.plane),
        tick: this.runtime.save.tick,
        audioEnabled: this.prefs.audio.enabled,
        reducedShake: this.prefs.reducedShake,
        reducedFlash: this.prefs.reducedFlash,
        persistError: this.persistError,
        storageWarning: this.storageWarning,
        pendingNewGameSeed: this.pendingNewGameSeed,
        pendingImportSeed: this.pendingImport?.worldSeed ?? null,
      },
    };
  }

  private isConfirmModal(): boolean {
    return this.runtime.save.modal === "confirm-new-game" || this.runtime.save.modal === "confirm-import";
  }

  private clearPendingLifecycle(): void {
    this.pendingNewGameSeed = null;
    this.pendingReturnModal = null;
    this.pendingImport = null;
  }

  private resetToNewGame(seed: string): void {
    this.runtime = createNewGame(CORE_IDENTITY.generatorVersion, seed, {
      cache: createAcceptedWorldCache(),
    });
    this.messages = [];
    this.lastEvents = [];
    this.musicKey = null;
    if (this.audioArmed && this.prefs.audio.enabled) {
      this.syncMusic(true);
    }
  }

  private syncMusic(force = false): void {
    if (!this.prefs.audio.enabled) {
      this.presentation.stopMusic();
      this.musicKey = null;
      return;
    }
    const key = planeKey(this.runtime.save.plane);
    if (!force && key === this.musicKey) {
      return;
    }
    this.musicKey = key;
    this.presentation.startMusic({ plane: this.runtime.save.plane });
  }
}
