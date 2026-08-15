import { CONTENT_REGISTRY } from "../data/registry";
import { resolveRewardProfileDrop } from "../generation/resolve-progression";
import type { WorldTopology } from "../generation/topology-types";
import type { ActorState, SaveState } from "../model/save-state";
import { dominantDimension } from "./actor-stats";
import { collectProgressionSource, grantApEvent, spawnGroundItem } from "./grants";
import { refreshQuestProgress } from "./quests";
import type { TickEvent } from "./tick-events";
import type { GameRuntime } from "../runtime/game-runtime";

export function applyMonsterDeathRewards(runtime: GameRuntime, actor: ActorState, events: TickEvent[]): void {
  const save = runtime.save;
  if (actor.kind === "guardian" || actor.id.startsWith("boss.")) {
    applyGuardianDeathRewards(runtime, actor, events);
  } else if (actor.kind === "monster") {
    applyOrdinaryMonsterDrops(runtime.topology, save, actor, events);
  }
  refreshQuestProgress(runtime, events);
}

function applyGuardianDeathRewards(runtime: GameRuntime, actor: ActorState, events: TickEvent[]): void {
  const source = runtime.topology.progressionSources.find((row) => row.id === `source.guardian_reward.${actor.id}`);
  if (source) {
    collectProgressionSource(runtime.save, source, events, { x: actor.x, y: actor.y });
  }
  const guardian = runtime.topology.guardianInstances.find((row) => row.id === actor.id);
  const encounter = CONTENT_REGISTRY.guardianEncounters.find((row) => row.id === guardian?.encounterId);
  const profile = CONTENT_REGISTRY.guardianRewardProfiles.find((row) => row.id === encounter?.rewardProfile)
    ?? (actor.id.startsWith("boss.") ? CONTENT_REGISTRY.guardianRewardProfiles.find((row) => row.id === "boss_final") : undefined);
  const ap = profile?.ap ?? 1;
  if (ap === 1) {
    grantApEvent(runtime.save, "ap_guardian_defeat", `ap_guardian_defeat:${actor.id}`, events);
  } else if (ap >= 2) {
    grantApEvent(runtime.save, "ap_major_boss", `ap_major_boss:${actor.id}`, events);
  }
}

function applyOrdinaryMonsterDrops(topology: WorldTopology, save: SaveState, actor: ActorState, events: TickEvent[]): void {
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  if (!species?.rewardProfile) {
    return;
  }
  const profile = CONTENT_REGISTRY.monsterRewardProfiles.find((row) => row.id === species.rewardProfile);
  if (!profile) {
    return;
  }
  const tier = Math.max(species.baseTier, dominantDimension(actor.plane));
  const currency = 1 + Math.floor(tier / 3) + profile.currencyBonus;
  if (currency > 0) {
    save.player.currency += currency;
    events.push({ type: "currency_gained", actorId: actor.id, amount: currency });
  }
  const drop = resolveRewardProfileDrop(topology, actor.id, species.rewardProfile);
  if (drop) {
    spawnGroundItem(save, drop, 1, actor.plane, { x: actor.x, y: actor.y });
    events.push({ type: "item_dropped", actorId: actor.id, detail: drop, x: actor.x, y: actor.y });
  }
}
