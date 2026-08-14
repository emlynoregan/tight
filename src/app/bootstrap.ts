import "./shell.css";
import { GameController } from "./game-controller";
import { SimulationClock } from "./clock";
import { KeyboardAdapter } from "../input/keyboard";
import { mountShell } from "../ui/shell";
import { renderHud } from "../ui/hud";
import { createWorldRenderer } from "../renderer/world-renderer";

const host = document.getElementById("app");
if (!host) {
  throw new Error("#app missing");
}

const params = new URLSearchParams(window.location.search);
const seed = params.get("seed") ?? "0";
const shell = mountShell(host);
const controller = new GameController({ seed });
const clock = new SimulationClock();
const world = await createWorldRenderer(shell.worldHost, controller.presentation);

new KeyboardAdapter(window, (intent) => {
  controller.handleIntent(intent);
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

function frame(now: number): void {
  if (clock.step(now).shouldSimulate) {
    controller.tick();
  }
  const snapshot = controller.snapshot();
  world.sync(snapshot.plane, now);
  world.app.render();
  renderHud(shell, snapshot.hud, controller.presentation);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
