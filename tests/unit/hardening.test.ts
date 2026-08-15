import { describe, expect, it } from "vitest";
import {
  createAcceptedWorldCache,
  createNewGame,
  hashSaveState,
  makeSaveRecord,
  parseSaveJson,
} from "../../src/core";
import { GameController, type GameControllerOptions } from "../../src/app/game-controller";
import { forceNewFromLocation, qaModeFromLocation, seedFromLocation, shareSeedUrl } from "../../src/app/seed-url";
import { mapKeydown } from "../../src/input/input-map";
import { MemoryPersistence, normalizePreferences } from "../../src/persistence";
import { PresentationFacade, ProceduralVisualProvider, SilentAudioProvider } from "../../src/presentation";

function silent(options: GameControllerOptions = {}) {
  return new GameController({
    presentation: new PresentationFacade(new ProceduralVisualProvider(), new SilentAudioProvider()),
    ...options,
  });
}

describe("seed URL helpers", () => {
  it("reads query and hash seed without treating the URL as save state", () => {
    expect(seedFromLocation("?seed=alpha", "")).toBe("alpha");
    expect(seedFromLocation("", "#seed=beta")).toBe("beta");
    expect(seedFromLocation("?new=1", "#seed=from-hash")).toBe("from-hash");
    expect(seedFromLocation("", "")).toBeNull();
    expect(forceNewFromLocation("?new=1")).toBe(true);
    expect(qaModeFromLocation("?qa=1&seed=0")).toBe(true);
    expect(shareSeedUrl("https://example.test", "/tight/", "seed-1")).toBe("https://example.test/tight/?seed=seed-1");
  });
});

describe("settings and New Game seed", () => {
  it("opens settings from Esc when no modal is open", () => {
    const controller = silent({ seed: "0" });
    expect(controller.handleIntent({ type: "closeModal" })?.ok).toBe(true);
    expect(controller.runtime.save.modal).toBe("settings");
    expect(controller.tick().advanced).toBe(false);
    expect(controller.handleIntent({ type: "settings" })?.ok).toBe(true);
    expect(controller.runtime.save.modal).toBeNull();
    expect(mapKeydown("KeyO", false)).toEqual({ type: "settings" });
  });

  it("replaces the save with a typed seed after confirmation", () => {
    const controller = silent({ seed: "0" });
    expect(controller.runtime.save.worldSeed).toBe("0");
    expect(controller.requestNewGame("seed-alpha")?.ok).toBe(true);
    expect(controller.runtime.save.modal).toBe("confirm-new-game");
    expect(controller.runtime.save.worldSeed).toBe("0");
    expect(controller.command({ type: "closeModal" }).ok).toBe(true);
    expect(controller.runtime.save.modal).toBeNull();
    expect(controller.runtime.save.worldSeed).toBe("0");
    expect(controller.requestNewGame("seed-alpha")?.ok).toBe(true);
    expect(controller.command({ type: "newGame" }).ok).toBe(true);
    expect(controller.runtime.save.worldSeed).toBe("seed-alpha");
    expect(controller.runtime.save.tick).toBe(0);
    expect(controller.runtime.save.modal).toBeNull();
  });

  it("keeps victory cancel behaviour when New Game starts from the victory modal", () => {
    const runtime = createNewGame("tight-v1", "0", { cache: createAcceptedWorldCache() });
    runtime.save.modal = "victory";
    runtime.save.flags.push("victory");
    const controller = silent({ runtime });
    expect(controller.command({ type: "newGame" }).ok).toBe(true);
    expect(controller.runtime.save.modal).toBe("confirm-new-game");
    expect(controller.command({ type: "closeModal" }).ok).toBe(true);
    expect(controller.runtime.save.modal).toBe("victory");
    expect(controller.runtime.save.flags).toContain("victory");
  });
});

describe("save export and import", () => {
  it("exports JSON that imports into a clean store after confirmation", async () => {
    const first = silent({ seed: "0" });
    first.handleIntent({ type: "wait" });
    first.tick();
    const json = first.exportSaveJson();
    const parsed = parseSaveJson(json);
    expect(parsed.ok).toBe(true);
    const second = silent({ seed: "1" });
    expect(second.runtime.save.worldSeed).toBe("1");
    expect(second.requestImport(json).ok).toBe(true);
    expect(second.runtime.save.modal).toBe("confirm-import");
    expect(second.runtime.save.worldSeed).toBe("1");
    expect(second.confirmImport().ok).toBe(true);
    expect(hashSaveState(second.runtime.save)).toBe(hashSaveState(first.runtime.save));
    expect(second.runtime.save.worldSeed).toBe("0");
    expect(second.runtime.save.tick).toBe(1);
    await second.persist();
  });

  it("rejects invalid JSON and topology mismatches rather than guessing", () => {
    const controller = silent({ seed: "0" });
    expect(controller.requestImport("{not json").ok).toBe(false);
    expect(controller.runtime.save.modal).not.toBe("confirm-import");
    const record = makeSaveRecord(controller.runtime.save);
    const broken = { ...record, topologyHash: "0".repeat(64), saveState: { ...record.saveState, topologyHash: "0".repeat(64) } };
    expect(controller.requestImport(JSON.stringify(broken)).ok).toBe(false);
    expect(controller.runtime.save.worldSeed).toBe("0");
  });
});

describe("preferences", () => {
  it("backfills reduced-motion flags and persists audio disable", async () => {
    expect(normalizePreferences({ audio: { enabled: false, master: 1, music: 0.5, sfx: 0.5 } })).toEqual({
      audio: { enabled: false, master: 1, music: 0.5, sfx: 0.5 },
      reducedShake: false,
      reducedFlash: false,
    });
    expect(normalizePreferences(null, true).reducedFlash).toBe(true);
    const store = new MemoryPersistence();
    const controller = silent({ persistence: store, prefersReducedMotion: true });
    expect(controller.prefs.reducedShake).toBe(true);
    await controller.setPreferences({ audioEnabled: false, reducedFlash: true, reducedShake: false });
    expect(controller.prefs.audio.enabled).toBe(false);
    expect(controller.prefs.reducedShake).toBe(false);
    expect(store.preferences?.audio.enabled).toBe(false);
  });
});
