import type { IntentionalAction } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { resolveAction, type TickEvent } from "./actions";
import { capturePlayerAction } from "./commands";
import { initiativeOrder } from "./initiative";

export interface TickResult {
  readonly advanced: boolean;
  readonly tick: number;
  readonly events: readonly TickEvent[];
  readonly reason?: "paused";
}

export function advanceTick(runtime: GameRuntime): TickResult {
  const save = runtime.save;
  if (save.modal) {
    return { advanced: false, tick: save.tick, events: [{ type: "paused", detail: save.modal }], reason: "paused" };
  }

  const playerAction = capturePlayerAction(save);
  const intended = new Map<string, IntentionalAction>();
  intended.set("player", playerAction);
  for (const actor of save.actors) {
    if (actor.id !== "player") {
      intended.set(actor.id, { type: "wait" });
    }
  }

  const events: TickEvent[] = [];
  const order = initiativeOrder(save.actors, save.worldSeed, save.tick);
  const acted = new Set<string>();
  for (const entry of order) {
    if (acted.has(entry.actorId)) {
      continue;
    }
    const actor = save.actors.find((row) => row.id === entry.actorId);
    const action = intended.get(entry.actorId);
    if (!actor || !action) {
      continue;
    }
    events.push(...resolveAction(save, runtime.currentPlaneBase, actor, action));
    acted.add(entry.actorId);
  }

  save.tick += 1;
  return { advanced: true, tick: save.tick, events };
}
