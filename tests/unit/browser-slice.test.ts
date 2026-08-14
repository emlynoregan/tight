import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyPlayerCommand,
  createAcceptedWorldCache,
  createNewGame,
  getAvailableActions,
  getHudView,
  getVisiblePlaneView,
  hashSaveState,
  MAP_SIZE,
} from "../../src/core";
import { GameController } from "../../src/app/game-controller";
import { SimulationClock } from "../../src/app/clock";
import { mapKeydown } from "../../src/input/input-map";
import { PresentationFacade, ProceduralVisualProvider, SilentAudioProvider } from "../../src/presentation";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walkFiles(path));
    } else if (path.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("simulation clock", () => {
  it("fires at most one 1 Hz tick and discards catch-up after hide", () => {
    const clock = new SimulationClock(1000);
    clock.start(0);
    expect(clock.step(999).shouldSimulate).toBe(false);
    expect(clock.step(1000).shouldSimulate).toBe(true);
    expect(clock.step(1999).shouldSimulate).toBe(false);
    expect(clock.step(2000).shouldSimulate).toBe(true);
    clock.setHidden(true, 2500);
    expect(clock.step(10_000).shouldSimulate).toBe(false);
    clock.setHidden(false, 10_000);
    expect(clock.step(10_000).shouldSimulate).toBe(false);
    expect(clock.step(10_999).shouldSimulate).toBe(false);
    expect(clock.step(11_000).shouldSimulate).toBe(true);
  });
});

describe("input mapping", () => {
  it("maps movement on press edge only and ignores browser repeat", () => {
    expect(mapKeydown("ArrowUp", false)).toEqual({ type: "holdDirection", direction: "north" });
    expect(mapKeydown("KeyW", false)).toEqual({ type: "holdDirection", direction: "north" });
    expect(mapKeydown("ArrowUp", true)).toBeNull();
    expect(mapKeydown("Space", false)).toEqual({ type: "wait" });
    expect(mapKeydown("Space", true)).toBeNull();
    expect(mapKeydown("KeyE", false)).toEqual({ type: "interact" });
    expect(mapKeydown("KeyF", false)).toEqual({ type: "attack" });
    expect(mapKeydown("Escape", false)).toEqual({ type: "closeModal" });
  });
});

describe("read models", () => {
  it("exposes a 16x16 plane and HUD gems without mutating save state", () => {
    const runtime = createNewGame("tight-v1", "0", { cache: createAcceptedWorldCache() });
    const before = hashSaveState(runtime.save);
    const plane = getVisiblePlaneView(runtime);
    const hud = getHudView(runtime);
    expect(plane.cells).toHaveLength(MAP_SIZE * MAP_SIZE);
    expect(plane.actors.some((actor) => actor.id === "player")).toBe(true);
    expect(plane.visibilityProfileId).toBe("clear");
    expect(plane.visibilityRadius).toBe("unlimited");
    expect(plane.cells.some((cell) => cell.visible)).toBe(true);
    expect(plane.actors.find((actor) => actor.id === "player")?.visible).toBe(true);
    expect(hud.gems).toHaveLength(16);
    expect(hud.gems.filter((gem) => gem.state === "current").map((gem) => gem.dimension)).toEqual([0, 1]);
    expect(hud.hp).toBeGreaterThan(0);
    expect(hud.actionHints.length).toBeGreaterThan(0);
    expect(getAvailableActions(runtime).defaultAttack).toBeNull();
    expect(hashSaveState(runtime.save)).toBe(before);
  });
});

describe("game controller", () => {
  it("queues commands and ticks without a renderer or live audio", async () => {
    const controller = new GameController({
      seed: "0",
      presentation: new PresentationFacade(new ProceduralVisualProvider(), new SilentAudioProvider()),
    });
    const before = hashSaveState(controller.runtime.save);
    await controller.resumeAudio();
    expect(hashSaveState(controller.runtime.save)).toBe(before);
    const snap = controller.snapshot();
    expect(snap.plane.cells).toHaveLength(256);
    expect(snap.hud.plane).toEqual(controller.runtime.save.plane);
    const queued = controller.handleIntent({ type: "wait" });
    expect(queued?.ok).toBe(true);
    const result = controller.tick();
    expect(result.advanced).toBe(true);
    expect(controller.runtime.save.tick).toBe(1);
    expect(controller.snapshot().hud.messages.some((line) => line.includes("Waited"))).toBe(true);
    applyPlayerCommand(controller.runtime, { type: "setHeldDirection", direction: "north" });
    expect(controller.runtime.save.heldDirection).toBe("north");
  });
});

describe("headless isolation", () => {
  it("does not import pixi from core or the game controller", () => {
    for (const file of [...walkFiles(join(ROOT, "src/core")), join(ROOT, "src/app/game-controller.ts"), join(ROOT, "src/app/clock.ts")]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']pixi\.js["']/);
    }
  });
});
