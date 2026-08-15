import type { WitnessStep } from "../generation/solver-types";
import { OLYMPUS_PLANE, planesEqual } from "../model/plane";
import type { GameRuntime } from "./game-runtime";
import { playerActor } from "./game-runtime";
import { collectProgressionSource, grantApEvent, learnAbility } from "../rules/grants";
import { completeQuest, refreshQuestProgress } from "../rules/quests";
import { buyShopSource } from "../rules/shops";
import { switchCurrentPlane } from "../rules/transitions";
import { itemQuantity, removeInventoryItem } from "../rules/inventory";
import type { TickEvent } from "../rules/tick-events";

export interface WitnessExecutionResult {
  readonly ok: boolean;
  readonly stepIndex: number;
  readonly events: readonly TickEvent[];
  readonly message?: string;
}

function fail(stepIndex: number, events: TickEvent[], message: string): WitnessExecutionResult {
  return { ok: false, stepIndex, events, message };
}

export function executeWitness(runtime: GameRuntime, witness: readonly WitnessStep[]): WitnessExecutionResult {
  const events: TickEvent[] = [];
  const player = playerActor(runtime);
  for (const [index, step] of witness.entries()) {
    if (step.type === "START" || step.type === "DISCOVER_DIMENSION") {
      continue;
    }
    if (step.type === "TRAVERSE_TRANSITION" && step.id) {
      const transition = runtime.topology.transitions.find((row) => row.id === step.id);
      if (!transition) {
        return fail(index, events, `missing transition ${step.id}`);
      }
      const dest = switchCurrentPlane(runtime, transition.destinationPlane);
      if (!dest) {
        return fail(index, events, `could not load ${step.id}`);
      }
      player.plane = { ...transition.destinationPlane };
      runtime.save.plane = { ...transition.destinationPlane };
      events.push({ type: "transition_activated", targetId: transition.id });
      continue;
    }
    if ((step.type === "COLLECT_SOURCE" || step.type === "ACQUIRE_KEY") && step.id) {
      const source = runtime.topology.progressionSources.find((row) => row.id === step.id)
        ?? runtime.topology.progressionSources.find((row) => row.grants.includes(`item:${step.id}`));
      if (!source) {
        continue;
      }
      collectProgressionSource(runtime.save, source, events, { x: player.x, y: player.y });
      continue;
    }
    if (step.type === "DEFEAT_GUARDIAN" && step.id) {
      if (!runtime.save.flags.includes(`defeated:${step.id}`)) {
        runtime.save.flags.push(`defeated:${step.id}`);
      }
      runtime.save.actors = runtime.save.actors.filter((actor) => actor.id !== step.id);
      const source = runtime.topology.progressionSources.find((row) => row.id === `source.guardian_reward.${step.id}`);
      if (source) {
        collectProgressionSource(runtime.save, source, events, { x: player.x, y: player.y });
      }
      grantApEvent(runtime.save, "ap_guardian_defeat", `ap_guardian_defeat:${step.id}`, events);
      refreshQuestProgress(runtime, events);
      continue;
    }
    if (step.type === "COMPLETE_QUEST" && step.id) {
      const instance = runtime.topology.questInstances.find((row) => row.id === step.id);
      if (instance) {
        completeQuest(runtime, instance.questId, events);
      }
      continue;
    }
    if (step.type === "LEARN_ABILITY" && step.id) {
      learnAbility(runtime.save, step.id, events);
      continue;
    }
    if (step.type === "BUY_ITEM" && step.id) {
      const bought = buyShopSource(runtime, step.id, events);
      if (!bought) {
        return fail(index, events, `could not buy ${step.id}`);
      }
      continue;
    }
    if (step.type === "UNLOCK_GATE" && step.id) {
      const gate = runtime.topology.gates.find((row) => row.id === step.id);
      if (gate?.requiredResourceId && gate.requiredQuantity) {
        if (itemQuantity(runtime.save, gate.requiredResourceId) < gate.requiredQuantity) {
          return fail(index, events, `missing resource for ${gate.id}`);
        }
        for (let n = 0; n < gate.requiredQuantity; n += 1) {
          removeInventoryItem(runtime.save, gate.requiredResourceId, 1);
        }
      }
      if (gate?.requiredFlag && !runtime.save.flags.includes(gate.requiredFlag)) {
        runtime.save.flags.push(gate.requiredFlag);
      }
      continue;
    }
    if (step.type === "REACH_OLYMPUS" || step.type === "FINAL_BOSS_AVAILABLE") {
      if (!planesEqual(runtime.save.plane, OLYMPUS_PLANE)) {
        switchCurrentPlane(runtime, OLYMPUS_PLANE);
        player.plane = { ...OLYMPUS_PLANE };
      }
    }
  }
  return { ok: true, stepIndex: witness.length, events };
}
