import { CONTENT_REGISTRY } from "../data/registry";
import type { QuestDefinition } from "../model/content-types";
import type { QuestProgress, QuestProgressState, SaveState } from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { applyGrantTokens, collectProgressionSource, grantApEvent } from "./grants";
import type { TickEvent } from "./tick-events";

export function questState(save: SaveState, questId: string): QuestProgressState {
  return save.quests.find((row) => row.questId === questId)?.state ?? "unavailable";
}

function questInstanceId(runtime: GameRuntime, questId: string): string {
  return runtime.topology.questInstances.find((row) => row.questId === questId)?.id ?? `quest.${questId}`;
}

function recordFor(save: SaveState, questId: string): QuestProgress | undefined {
  return save.quests.find((row) => row.questId === questId);
}

function ensureRecord(runtime: GameRuntime, questId: string): QuestProgress {
  const existing = recordFor(runtime.save, questId);
  if (existing) {
    return existing;
  }
  const created: QuestProgress = {
    instanceId: questInstanceId(runtime, questId),
    questId,
    state: "unavailable",
  };
  runtime.save.quests.push(created);
  return created;
}

function playerDropCell(runtime: GameRuntime) {
  const player = runtime.save.actors.find((actor) => actor.id === "player");
  return player ? { x: player.x, y: player.y } : null;
}

function objectivesMet(runtime: GameRuntime, quest: QuestDefinition): boolean {
  return quest.objectives.every((objective) => {
    if (objective.type === "speak_to_giver") {
      return questState(runtime.save, quest.id) !== "unavailable";
    }
    if (objective.type === "reach_dimension") {
      return runtime.save.discoveredDimensions.includes(objective.dimension);
    }
    if (objective.type === "defeat_encounter") {
      if (objective.encounterId === "boss_olympus") {
        return runtime.save.flags.includes("defeated:boss.boss_olympus") || runtime.save.flags.includes("final_boss_dead");
      }
      return runtime.topology.guardianInstances.some(
        (guardian) =>
          guardian.encounterId === objective.encounterId && runtime.save.flags.includes(`defeated:${guardian.id}`),
      );
    }
    return false;
  });
}

export function startQuest(runtime: GameRuntime, questId: string, events: TickEvent[]): boolean {
  const quest = CONTENT_REGISTRY.byId.quest.get(questId);
  if (!quest) {
    return false;
  }
  const record = ensureRecord(runtime, questId);
  if (record.state === "complete") {
    return false;
  }
  if (record.state === "unavailable") {
    record.state = "active";
    events.push({ type: "quest_started", detail: questId, targetId: record.instanceId });
  }
  refreshQuestProgress(runtime, events);
  return true;
}

export function completeQuest(runtime: GameRuntime, questId: string, events: TickEvent[]): boolean {
  const quest = CONTENT_REGISTRY.byId.quest.get(questId);
  if (!quest) {
    return false;
  }
  const record = ensureRecord(runtime, questId);
  if (record.state === "complete") {
    return false;
  }
  record.state = "complete";
  const source = runtime.topology.progressionSources.find((row) => row.id === `source.quest_reward.${record.instanceId}`);
  const dropAt = playerDropCell(runtime);
  if (source) {
    collectProgressionSource(runtime.save, source, events, dropAt);
  } else {
    applyGrantTokens(
      runtime.save,
      [
        ...quest.rewards.flagIds.map((flag) => `flag:${flag}`),
        ...quest.rewards.learnAbilityIds.map((abilityId) => `ability:${abilityId}`),
      ],
      events,
      dropAt,
    );
  }
  if (quest.rewards.apEventId && quest.rewards.apEventId !== "ap_guardian_defeat") {
    grantApEvent(runtime.save, quest.rewards.apEventId, `${quest.rewards.apEventId}:${questId}`, events);
  }
  events.push({ type: "quest_completed", detail: questId, targetId: record.instanceId });
  return true;
}

export function refreshQuestProgress(runtime: GameRuntime, events: TickEvent[]): void {
  for (const instance of runtime.topology.questInstances) {
    const quest = CONTENT_REGISTRY.byId.quest.get(instance.questId);
    if (!quest) {
      continue;
    }
    const record = recordFor(runtime.save, instance.questId);
    if (!record || record.state !== "active") {
      continue;
    }
    if (objectivesMet(runtime, quest)) {
      completeQuest(runtime, instance.questId, events);
    }
  }
}
