import { CONTENT_REGISTRY } from "../data/registry";
import { planeEligibleForArchetype } from "../data/eligibility";
import { planeKey, STARTING_PLANE, type PlanePair } from "../model/plane";
import { semantic, weightedChoice, type SemanticPart } from "./semantic-random";
import type {
  GuardianInstance,
  NpcInstance,
  ProgressionSource,
  QuestInstance,
  ShopInstance,
  TopologyTransition,
} from "./topology-types";

interface PlacementContext {
  readonly generatorVersion: string;
  readonly worldSeed: string;
  readonly topologyAttempt: number;
  readonly allPlanes: readonly PlanePair[];
  readonly npcInstances: NpcInstance[];
  readonly questInstances: QuestInstance[];
  readonly guardianInstances: GuardianInstance[];
  readonly progressionSources: ProgressionSource[];
  readonly shopInstances: ShopInstance[];
}

function parts(ctx: PlacementContext, purpose: string, subject: string): SemanticPart[] {
  return [
    semantic.string(ctx.generatorVersion),
    semantic.string(ctx.worldSeed),
    semantic.i64(ctx.topologyAttempt),
    semantic.string(purpose),
    semantic.string(subject),
  ];
}

function npcArchetypeId(npcId: string): string | null {
  const story = CONTENT_REGISTRY.byId.storyNpc.get(npcId);
  if (story) {
    return story.archetypeId;
  }
  return CONTENT_REGISTRY.byId.npcArchetype.has(npcId) ? npcId : null;
}

function eligiblePlanesForNpc(npcId: string, planes: readonly PlanePair[]): PlanePair[] {
  const archetypeId = npcArchetypeId(npcId);
  if (!archetypeId) {
    return [...planes];
  }
  const archetype = CONTENT_REGISTRY.byId.npcArchetype.get(archetypeId);
  if (!archetype) {
    return [];
  }
  return planes.filter((plane) => planeEligibleForArchetype(plane, archetype));
}

function pickPlane(ctx: PlacementContext, subject: string, planes: readonly PlanePair[]): PlanePair {
  if (planes.length === 1) {
    return planes[0]!;
  }
  return weightedChoice(
    parts(ctx, "topology.progressionSource.assignment", subject),
    planes.map((plane) => ({ id: planeKey(plane), weight: 1, value: plane })),
  );
}

function replaceSource(ctx: PlacementContext, source: ProgressionSource): void {
  const index = ctx.progressionSources.findIndex((row) => row.id === source.id);
  if (index >= 0) {
    ctx.progressionSources[index] = source;
  } else {
    ctx.progressionSources.push(source);
  }
}

function addUniqueTokens(existing: readonly string[], extras: readonly string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const token of extras) {
    if (!seen.has(token)) {
      seen.add(token);
      merged.push(token);
    }
  }
  return merged;
}

export function placeNpc(
  ctx: PlacementContext,
  npcId: string,
  candidatePlanes: readonly PlanePair[],
): NpcInstance | { error: string } {
  const isStory = CONTENT_REGISTRY.byId.storyNpc.has(npcId);
  if (isStory) {
    const existing = ctx.npcInstances.find((row) => row.npcId === npcId);
    if (existing) {
      return existing;
    }
  }
  let pool = eligiblePlanesForNpc(npcId, candidatePlanes);
  if (pool.length === 0) {
    pool = eligiblePlanesForNpc(npcId, ctx.allPlanes);
  }
  if (pool.length === 0) {
    return { error: `no eligible plane for NPC ${npcId}` };
  }
  const plane = pickPlane(ctx, `npc.${npcId}`, pool);
  const ordinal = ctx.npcInstances.filter((row) => row.npcId === npcId).length;
  const instance: NpcInstance = {
    id: `npc.${npcId}.${planeKey(plane)}.${ordinal}`,
    npcId,
    plane,
  };
  ctx.npcInstances.push(instance);
  return instance;
}

function guardianDefeatFlag(guardian: GuardianInstance): string {
  return guardian.gatedTransitionId
    ? `gate.${guardian.gatedTransitionId}.guardianDefeated`
    : `guardian.${guardian.id}.defeated`;
}

function guardianRewardGrants(guardian: GuardianInstance): string[] {
  const encounter = CONTENT_REGISTRY.guardianEncounters.find((row) => row.id === guardian.encounterId);
  const profile = CONTENT_REGISTRY.guardianRewardProfiles.find((row) => row.id === encounter?.rewardProfile);
  const grants = [`flag:${guardianDefeatFlag(guardian)}`];
  if (profile && profile.currency > 0) {
    grants.push(`currency:${profile.currency}`);
  }
  return grants;
}

export function createGateGuardian(
  ctx: PlacementContext,
  transition: TopologyTransition,
  encounterId: string,
  monsterId: string,
): GuardianInstance {
  const guardian: GuardianInstance = {
    id: `guardian.${transition.id}`,
    encounterId,
    monsterId,
    plane: transition.sourcePlane,
    gatedTransitionId: transition.id,
  };
  ctx.guardianInstances.push(guardian);
  ctx.progressionSources.push({
    id: `source.guardian_reward.${guardian.id}`,
    plane: guardian.plane,
    sourceType: "guardian_reward",
    grants: guardianRewardGrants(guardian),
    requirements: [],
    consumption: false,
    contentReference: encounterId,
    quantity: 1,
  });
  return guardian;
}

function ensureGuardianForEncounter(
  ctx: PlacementContext,
  encounterId: string,
  candidatePlanes: readonly PlanePair[],
): GuardianInstance | { error: string } {
  const existing = ctx.guardianInstances.find((row) => row.encounterId === encounterId);
  if (existing) {
    return existing;
  }
  const spec = CONTENT_REGISTRY.guardianEncounters.find((row) => row.id === encounterId);
  if (!spec) {
    return { error: `unknown guardian encounter ${encounterId}` };
  }
  const bandLegal = (plane: PlanePair): boolean => plane.b >= spec.bandMin && plane.b <= spec.bandMax;
  let pool = candidatePlanes.filter(bandLegal);
  if (pool.length === 0) {
    pool = ctx.allPlanes.filter(bandLegal);
  }
  if (pool.length === 0) {
    return { error: `no eligible plane for guardian ${encounterId}` };
  }
  const plane = pickPlane(ctx, `guardian.${encounterId}`, pool);
  const guardian: GuardianInstance = {
    id: `guardian.${encounterId}.${planeKey(plane)}`,
    encounterId,
    monsterId: spec.monsterId,
    plane,
    gatedTransitionId: null,
  };
  ctx.guardianInstances.push(guardian);
  ctx.progressionSources.push({
    id: `source.guardian_reward.${guardian.id}`,
    plane,
    sourceType: "guardian_reward",
    grants: guardianRewardGrants(guardian),
    requirements: [],
    consumption: false,
    contentReference: encounterId,
    quantity: 1,
  });
  return guardian;
}

function questRequirements(
  ctx: PlacementContext,
  questId: string,
  candidatePlanes: readonly PlanePair[],
): { requirements: string[] } | { error: string } {
  const quest = CONTENT_REGISTRY.byId.quest.get(questId);
  if (!quest) {
    return { error: `unknown quest ${questId}` };
  }
  const requirements: string[] = [];
  for (const objective of quest.objectives) {
    if (objective.type !== "defeat_encounter" || objective.encounterId === "boss_olympus") {
      continue;
    }
    const guardian = ensureGuardianForEncounter(ctx, objective.encounterId, candidatePlanes);
    if ("error" in guardian) {
      return guardian;
    }
    requirements.push(`flag:${guardianDefeatFlag(guardian)}`);
  }
  return { requirements };
}

function questGrantTokens(questId: string, extraFlagIds: readonly string[]): string[] {
  const quest = CONTENT_REGISTRY.byId.quest.get(questId)!;
  const grants: string[] = [];
  for (const flagId of [...quest.rewards.flagIds, ...extraFlagIds]) {
    grants.push(`flag:${flagId}`);
  }
  for (const abilityId of quest.rewards.learnAbilityIds) {
    grants.push(`ability:${abilityId}`);
  }
  return grants;
}

export function ensureQuest(
  ctx: PlacementContext,
  questId: string,
  extraFlagId: string | null,
  candidatePlanes: readonly PlanePair[],
): QuestInstance | { error: string } {
  const quest = CONTENT_REGISTRY.byId.quest.get(questId);
  if (!quest) {
    return { error: `unknown quest ${questId}` };
  }
  const existing = ctx.questInstances.find((row) => row.questId === questId);
  if (existing) {
    if (extraFlagId && !existing.flagIds.includes(extraFlagId)) {
      const index = ctx.questInstances.findIndex((row) => row.id === existing.id);
      ctx.questInstances[index] = { ...existing, flagIds: [...existing.flagIds, extraFlagId] };
    }
    if (extraFlagId) {
      const sourceId = `source.quest_reward.${existing.id}`;
      const source = ctx.progressionSources.find((row) => row.id === sourceId);
      if (source) {
        replaceSource(ctx, {
          ...source,
          grants: addUniqueTokens(source.grants, [`flag:${extraFlagId}`]),
        });
      }
    }
    return ctx.questInstances.find((row) => row.questId === questId)!;
  }

  let plane: PlanePair;
  let npcInstanceId: string | null = null;
  if (quest.giver) {
    const npc = placeNpc(ctx, quest.giver, candidatePlanes);
    if ("error" in npc) {
      return npc;
    }
    plane = npc.plane;
    npcInstanceId = npc.id;
  } else {
    plane = pickPlane(ctx, `quest.${questId}`, candidatePlanes.length > 0 ? candidatePlanes : ctx.allPlanes);
  }

  const resolved = questRequirements(ctx, questId, [plane, ...candidatePlanes]);
  if ("error" in resolved) {
    return resolved;
  }
  const extraFlags = extraFlagId ? [extraFlagId] : [];
  const instance: QuestInstance = {
    id: `quest.${questId}.${planeKey(plane)}.0`,
    questId,
    plane,
    npcId: npcInstanceId,
    flagIds: extraFlags,
  };
  ctx.questInstances.push(instance);
  ctx.progressionSources.push({
    id: `source.quest_reward.${instance.id}`,
    plane,
    sourceType: "quest_reward",
    grants: questGrantTokens(questId, extraFlags),
    requirements: resolved.requirements,
    consumption: false,
    contentReference: questId,
    quantity: 1,
  });
  return instance;
}

export function assignAbilitySource(
  ctx: PlacementContext,
  transition: TopologyTransition,
  abilityId: string,
  candidatePlanes: readonly PlanePair[],
): { error?: string } {
  const acquisition = CONTENT_REGISTRY.abilityAcquisitions.find((row) => row.abilityId === abilityId);
  if (!acquisition) {
    return { error: `no catalogue acquisition for ${abilityId}` };
  }
  if (acquisition.questId) {
    const quest = ensureQuest(ctx, acquisition.questId, null, candidatePlanes);
    if ("error" in quest) {
      return quest;
    }
    return {};
  }
  if (!acquisition.giverNpcId) {
    return { error: `ability ${abilityId} has no giver` };
  }
  const npc = placeNpc(ctx, acquisition.giverNpcId, candidatePlanes);
  if ("error" in npc) {
    return npc;
  }
  const requirements: string[] = [];
  if (acquisition.prerequisiteEncounterId) {
    const guardian = ensureGuardianForEncounter(ctx, acquisition.prerequisiteEncounterId, [npc.plane, ...candidatePlanes]);
    if ("error" in guardian) {
      return guardian;
    }
    requirements.push(`flag:${guardianDefeatFlag(guardian)}`);
  }
  ctx.progressionSources.push({
    id: `source.npc_teaching.${transition.id}.${abilityId}`,
    plane: npc.plane,
    sourceType: "npc_teaching",
    grants: [`ability:${abilityId}`],
    requirements,
    consumption: false,
    contentReference: abilityId,
    quantity: 1,
  });
  return {};
}

export function placeCatalogueShops(ctx: PlacementContext): { error?: string } {
  for (const def of CONTENT_REGISTRY.shopInstances) {
    if (def.onStartingPlane) {
      const keeper = placeNpc(ctx, "shopkeeper", [STARTING_PLANE]);
      if ("error" in keeper) {
        return keeper;
      }
      ctx.shopInstances.push({
        id: def.id,
        shopTypeId: def.shopTypeId,
        plane: STARTING_PLANE,
        npcInstanceId: keeper.id,
        catalogueShopId: def.id,
      });
      continue;
    }
    if (!def.anchorNpcId) {
      continue;
    }
    const anchor = ctx.npcInstances.find((row) => row.npcId === def.anchorNpcId);
    if (!anchor) {
      continue;
    }
    let merchant = anchor;
    if (!def.npcId) {
      const keeper = placeNpc(ctx, "shopkeeper", [anchor.plane]);
      if ("error" in keeper) {
        return keeper;
      }
      merchant = keeper;
    }
    ctx.shopInstances.push({
      id: def.id,
      shopTypeId: def.shopTypeId,
      plane: anchor.plane,
      npcInstanceId: merchant.id,
      catalogueShopId: def.id,
    });
  }
  return {};
}

export function createPlacementContext(
  generatorVersion: string,
  worldSeed: string,
  topologyAttempt: number,
  allPlanes: readonly PlanePair[],
): PlacementContext {
  return {
    generatorVersion,
    worldSeed,
    topologyAttempt,
    allPlanes,
    npcInstances: [],
    questInstances: [],
    guardianInstances: [],
    progressionSources: [],
    shopInstances: [],
  };
}
