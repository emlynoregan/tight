import type { IntentionalAction } from "../model/save-state";
import { planesEqual } from "../model/plane";
import type { GameRuntime } from "../runtime/game-runtime";
import { resolveAction } from "./actions";
import { selectMonsterAction } from "./ai";
import { applyPeriodicStatuses, expireStatusesAndCooldowns } from "./apply-effects";
import { effectiveAttributes, effectiveInitiativeModifier, syncDerivedMaxHp } from "./actor-stats";
import { capturePlayerAction } from "./commands";
import { resolveDeaths } from "./death";
import { applyEndTickHazards } from "./hazards";
import { initiativeOrder } from "./initiative";
import { applyEnvironmentalMovement } from "./space";
import { activeActors, evaluatePursuitHandoffs, syncPlaneAfterPlayerMove } from "./transitions";
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

  const present = activeActors(runtime);
  for (const actor of present) {
    syncDerivedMaxHp(save, actor);
  }

  const events: TickEvent[] = [];
  const playerAction = capturePlayerAction(save);
  const intended = new Map<string, IntentionalAction>();
  intended.set("player", playerAction);
  for (const actor of present) {
    if (actor.id === "player") {
      continue;
    }
    intended.set(actor.id, runtime.scriptedActions.get(actor.id) ?? selectMonsterAction(runtime, actor, events));
  }
  const order = initiativeOrder(present, save.worldSeed, save.tick, (actor) => {
    return effectiveAttributes(save, actor).spd + effectiveInitiativeModifier(save, actor);
  });
  const acted = new Set<string>();
  for (const entry of order) {
    if (acted.has(entry.actorId)) {
      continue;
    }
    const actor = save.actors.find((row) => row.id === entry.actorId);
    const action = intended.get(entry.actorId);
    if (!actor || !action || !planesEqual(actor.plane, save.plane)) {
      continue;
    }
    events.push(...resolveAction(runtime, actor, action));
    acted.add(entry.actorId);
  }

  applyEnvironmentalMovement(runtime, order.filter((entry) => {
    const actor = save.actors.find((row) => row.id === entry.actorId);
    return actor !== undefined && planesEqual(actor.plane, save.plane);
  }), events);
  applyPeriodicStatuses(save, runtime.currentPlaneBase, events);
  applyEndTickHazards(save, runtime.currentPlaneBase, events);
  resolveDeaths(runtime, events);
  syncPlaneAfterPlayerMove(runtime, events);
  expireStatusesAndCooldowns(save, events);
  evaluatePursuitHandoffs(runtime, events);

  save.tick += 1;
  return { advanced: true, tick: save.tick, events };
}
