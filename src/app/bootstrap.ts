import "./shell.css";
import { GameController } from "./game-controller";
import { SimulationClock } from "./clock";
import { forceNewFromLocation, qaModeFromLocation, randomWorldSeed, seedFromLocation, shareSeedUrl } from "./seed-url";
import { diagnosticsFromSaveRecord } from "./diagnostics";
import { KeyboardAdapter } from "../input/keyboard";
import type { Direction } from "../core/model/save-state";
import { mountShell } from "../ui/shell";
import { renderBanner, renderHud } from "../ui/hud";
import { bindModalCommands, bindSettingsFileInput, renderManagementModal } from "../ui/modals";
import { mountErrorScreen } from "../ui/error-screen";
import { createWorldRenderer } from "../renderer/world-renderer";
import { createPersistence } from "../persistence";

const host = document.getElementById("app");
if (!host) {
  throw new Error("#app missing");
}

void start(host);

async function start(root: HTMLElement): Promise<void> {
  const seed = seedFromLocation(window.location.search, window.location.hash) ?? "0";
  const forceNew = forceNewFromLocation(window.location.search);
  const qaMode = qaModeFromLocation(window.location.search);
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const opened = await createPersistence();
  const persistence = opened.persistence;
  let controller: GameController;
  try {
    controller = await GameController.open({
      seed,
      persistence,
      forceNew,
      prefersReducedMotion,
      storageWarning: opened.warning,
    });
  } catch (error) {
    const stored = await persistence.getSave();
    const message = error instanceof Error ? error.message : "Save could not be loaded.";
    const code = message.split(":")[0] ?? "INVALID_SAVE";
    mountErrorScreen(root, {
      diagnostics: diagnosticsFromSaveRecord(stored, code, message),
      stored,
      seed: stored?.worldSeed ?? seed,
    });
    return;
  }

  const shell = mountShell(root);
  const clock = new SimulationClock();
  const world = await createWorldRenderer(shell.worldHost, controller.presentation);

new KeyboardAdapter(window, (intent) => {
  controller.handleIntent(intent);
});

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const appHandlers = {
  exportSave() {
    downloadText(`tight-save-${controller.runtime.save.worldSeed}.json`, controller.exportSaveJson());
  },
  importSave(text: string) {
    const result = controller.requestImport(text);
    if (!result.ok) {
      controller.persistError = result.message;
    }
  },
  confirmImport() {
    const result = controller.confirmImport();
    if (!result.ok) {
      controller.persistError = result.message;
    }
  },
  requestNewGame(nextSeed: string) {
    const result = controller.requestNewGame(nextSeed);
    if (!result.ok) {
      controller.persistError = result.message;
    }
  },
  randomSeed() {
    return randomWorldSeed();
  },
  copySeed(value: string) {
    const text = value.trim() || controller.runtime.save.worldSeed;
    const share = shareSeedUrl(window.location.origin, window.location.pathname, text);
    void navigator.clipboard?.writeText(`${text}\n${share}`);
  },
  setAudioEnabled(enabled: boolean) {
    void controller.setPreferences({ audioEnabled: enabled });
  },
  setReducedShake(enabled: boolean) {
    void controller.setPreferences({ reducedShake: enabled });
  },
  setReducedFlash(enabled: boolean) {
    void controller.setPreferences({ reducedFlash: enabled });
  },
  clearCache() {
    void controller.clearGenerationCache();
  },
};

bindModalCommands(shell, (command) => {
  controller.command(command);
}, appHandlers);
bindSettingsFileInput(shell, appHandlers);

shell.settingsButton.addEventListener("click", () => {
  controller.handleIntent({ type: "settings" });
});

const TOUCH_DIRECTIONS = new Set<Direction>(["north", "east", "south", "west"]);
shell.touch.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-touch]") : null;
  if (!(target instanceof HTMLElement) || !target.dataset.touch) {
    return;
  }
  const action = target.dataset.touch;
  if (TOUCH_DIRECTIONS.has(action as Direction)) {
    event.preventDefault();
    controller.handleIntent({ type: "holdDirection", direction: action as Direction });
    return;
  }
  if (action === "wait") {
    controller.handleIntent({ type: "wait" });
  } else if (action === "interact") {
    controller.handleIntent({ type: "interact" });
  } else if (action === "attack") {
    controller.handleIntent({ type: "attack" });
  } else if (action === "pickup") {
    controller.handleIntent({ type: "pickup" });
  } else if (action === "settings") {
    controller.handleIntent({ type: "settings" });
  }
});
window.addEventListener("pointerup", () => {
  controller.handleIntent({ type: "clearHold" });
});

async function armAudio(): Promise<void> {
  if (controller.audioArmed) {
    return;
  }
  await controller.resumeAudio();
}

window.addEventListener("pointerdown", () => void armAudio(), { once: true });
window.addEventListener("keydown", () => void armAudio(), { once: true });

document.addEventListener("visibilitychange", () => {
  const now = performance.now();
  clock.setHidden(document.hidden, now);
  if (document.hidden) {
    controller.presentation.audio.suspend();
    return;
  }
  if (controller.audioArmed) {
    void controller.presentation.resume();
  }
});

clock.start(performance.now());
window.addEventListener("pagehide", () => {
  void controller.persist();
});

if (qaMode) {
  (window as unknown as { __tightQa: { controller: GameController } }).__tightQa = { controller };
}

function frame(now: number): void {
  try {
    if (clock.step(now).shouldSimulate) {
      controller.tick();
    }
    const snapshot = controller.snapshot();
    world.reducedShake = snapshot.settings.reducedShake;
    world.reducedFlash = snapshot.settings.reducedFlash;
    world.sync(snapshot.plane, now);
    world.app.render();
    renderHud(shell, snapshot.hud, controller.presentation);
    renderBanner(shell, snapshot.settings.persistError, snapshot.settings.storageWarning);
    renderManagementModal(shell, snapshot.hud.modal, snapshot.inventory, snapshot.character, {
      plane: snapshot.plane,
      presentation: controller.presentation,
      dialogue: snapshot.dialogue,
      shop: snapshot.shop,
      quests: snapshot.quests,
      settings: snapshot.settings,
    });
  } catch (error) {
    console.error(error);
    clock.setHidden(true, now);
    const snapshot = controller.snapshot();
    mountErrorScreen(root, {
      diagnostics: controller.diagnostics("RUNTIME", error instanceof Error ? error.message : String(error)),
      stored: {
        saveFormatVersion: 1,
        generatorVersion: snapshot.settings.generatorVersion,
        worldSeed: snapshot.settings.worldSeed,
        topologyHash: snapshot.settings.topologyHash,
        saveState: controller.runtime.save,
        updatedAt: new Date().toISOString(),
      },
      seed: snapshot.settings.worldSeed,
    });
    return;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
}
