import type { IntentionalAction } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { resolveAction } from "./actions";
import { applyPeriodicStatuses, expireStatusesAndCooldowns } from "./apply-effects";
import { effectiveAttributes, effectiveInitiativeModifier, syncDerivedMaxHp } from "./actor-stats";
import { capturePlayerAction } from "./commands";
import { resolveDeaths } from "./death";
import { initiativeOrder } from "./initiative";
import type { TickEvent } from "./tick-events";

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

  for (const actor of save.actors) {
    syncDerivedMaxHp(save, actor);
  }

  const playerAction = capturePlayerAction(save);
  const intended = new Map<string, IntentionalAction>();
  intended.set("player", playerAction);
  for (const actor of save.actors) {
    if (actor.id !== "player") {
      intended.set(actor.id, runtime.scriptedActions.get(actor.id) ?? { type: "wait" });
    }
  }

  const events: TickEvent[] = [];
  const order = initiativeOrder(save.actors, save.worldSeed, save.tick, (actor) => {
    return effectiveAttributes(save, actor).spd + effectiveInitiativeModifier(save, actor);
  });
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

  applyPeriodicStatuses(save, runtime.currentPlaneBase, events);
  resolveDeaths(save, events);
  expireStatusesAndCooldowns(save, events);

  save.tick += 1;
  return { advanced: true, tick: save.tick, events };
}
