import type { ContentRegistry } from "./registry";
import { CONTENT_REGISTRY } from "./registry";
import { ENCOUNTER_ROLES, PLACEMENT_PATTERNS } from "./encounters";
import { AI_PROFILES } from "./monsters";
import type { PrimitiveProfile } from "../model/content-types";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

function uniqueIds(path: string, ids: readonly (string | number)[], issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) {
      issues.push({ path, message: `duplicate id ${key}` });
    }
    seen.add(key);
  }
}

function requireRef(
  issues: ValidationIssue[],
  path: string,
  id: string,
  present: boolean,
): void {
  if (!present) {
    issues.push({ path, message: `dangling reference ${id}` });
  }
}

function validatePrimitiveProfile(profile: PrimitiveProfile, issues: ValidationIssue[]): void {
  const path = `primitiveProfiles.${profile.id}`;
  switch (profile.kind) {
    case "blob":
      if (profile.areaMin > profile.areaMax || profile.areaMin < 1) {
        issues.push({ path, message: "illegal blob area range" });
      }
      break;
    case "line":
    case "path":
      if (profile.widthMin > profile.widthMax || profile.widthMin < 1) {
        issues.push({ path, message: `illegal ${profile.kind} width range` });
      }
      break;
    case "rectangle":
      if (profile.widthMin > profile.widthMax || profile.heightMin > profile.heightMax) {
        issues.push({ path, message: "illegal rectangle range" });
      }
      break;
    case "strip":
      if (profile.width < 1 || profile.lengthMin > profile.lengthMax) {
        issues.push({ path, message: "illegal strip range" });
      }
      break;
    case "cluster":
      if (profile.countMin > profile.countMax || profile.radius < 1) {
        issues.push({ path, message: "illegal cluster range" });
      }
      break;
    case "scatter":
      if (profile.minSpacing < 1) {
        issues.push({ path, message: "illegal scatter spacing" });
      }
      break;
  }
}

export function validateContentRegistry(
  registry: ContentRegistry = CONTENT_REGISTRY,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (registry.planes.length !== registry.constants.planeCount) {
    issues.push({
      path: "planes",
      message: `expected ${registry.constants.planeCount} planes, found ${registry.planes.length}`,
    });
  }
  if (registry.dimensions.length !== registry.constants.dimensionCount) {
    issues.push({
      path: "dimensions",
      message: `expected ${registry.constants.dimensionCount} dimensions`,
    });
  }
  uniqueIds("dimensions", registry.dimensions.map((row) => row.id), issues);
  uniqueIds("attacks", registry.attacks.map((row) => row.id), issues);
  uniqueIds("statuses", registry.statuses.map((row) => row.id), issues);
  uniqueIds("atomicEffects", registry.atomicEffects.map((row) => row.id), issues);
  uniqueIds("effectBundles", registry.effectBundles.map((row) => row.id), issues);
  uniqueIds("abilities", registry.abilities.map((row) => row.id), issues);
  uniqueIds("items", registry.items.map((row) => row.id), issues);
  uniqueIds("monsters", registry.monsters.map((row) => row.id), issues);
  uniqueIds("encounters", registry.encounters.map((row) => row.id), issues);
  uniqueIds("hazards", registry.hazards.map((row) => row.id), issues);
  uniqueIds("tileTypes", registry.tileTypes.map((row) => row.id), issues);
  uniqueIds("quests", registry.quests.map((row) => row.id), issues);
  uniqueIds("transitionArchetypes", registry.transitionArchetypes.map((row) => row.id), issues);

  for (const [index, plane] of registry.planes.entries()) {
    if (plane.a >= plane.b) {
      issues.push({ path: `planes[${index}]`, message: `plane not canonical (${plane.a},${plane.b})` });
    }
  }

  const effectOrBundle = (id: string): boolean =>
    registry.byId.effect.has(id) || registry.byId.bundle.has(id);

  for (const attack of registry.attacks) {
    if (attack.onHitStatusId) {
      requireRef(issues, `attacks.${attack.id}.onHitStatusId`, attack.onHitStatusId, registry.byId.status.has(attack.onHitStatusId));
    }
    if (attack.accuracy < -5 || attack.accuracy > 5) {
      issues.push({ path: `attacks.${attack.id}.accuracy`, message: `unusual accuracy ${attack.accuracy}` });
    }
  }

  for (const effect of registry.atomicEffects) {
    if (effect.statusId) {
      requireRef(issues, `atomicEffects.${effect.id}.statusId`, effect.statusId, registry.byId.status.has(effect.statusId));
    }
  }

  for (const bundle of registry.effectBundles) {
    for (const effectId of bundle.effectIds) {
      requireRef(issues, `effectBundles.${bundle.id}`, effectId, registry.byId.effect.has(effectId));
    }
  }

  for (const ability of registry.abilities) {
    if (ability.attackId) {
      requireRef(issues, `abilities.${ability.id}.attackId`, ability.attackId, registry.byId.attack.has(ability.attackId));
    }
    if (ability.effectOrBundleId) {
      requireRef(issues, `abilities.${ability.id}.effectOrBundleId`, ability.effectOrBundleId, effectOrBundle(ability.effectOrBundleId));
    }
  }

  for (const [eventId, abilityId] of Object.entries(registry.learnEvents)) {
    requireRef(issues, `learnEvents.${eventId}`, abilityId, registry.byId.ability.has(abilityId));
  }

  for (const item of registry.items) {
    for (const attackId of item.attackIds) {
      requireRef(issues, `items.${item.id}.attackIds`, attackId, registry.byId.attack.has(attackId));
    }
    for (const abilityId of item.grantedAbilityIds) {
      requireRef(issues, `items.${item.id}.grantedAbilityIds`, abilityId, registry.byId.ability.has(abilityId));
    }
    if (item.useAbilityId) {
      requireRef(issues, `items.${item.id}.useAbilityId`, item.useAbilityId, registry.byId.ability.has(item.useAbilityId));
    }
    if (item.value < 0) {
      issues.push({ path: `items.${item.id}.value`, message: "negative value" });
    }
  }

  for (const monster of registry.monsters) {
    for (const attackId of monster.attackIds) {
      requireRef(issues, `monsters.${monster.id}.attackIds`, attackId, registry.byId.attack.has(attackId));
    }
    for (const abilityId of monster.abilityIds) {
      requireRef(issues, `monsters.${monster.id}.abilityIds`, abilityId, registry.byId.ability.has(abilityId));
    }
    if (!AI_PROFILES.includes(monster.aiProfile as (typeof AI_PROFILES)[number])) {
      issues.push({ path: `monsters.${monster.id}.aiProfile`, message: `unknown AI profile ${monster.aiProfile}` });
    }
    if (!registry.pursuitProfiles.some((profile) => profile.id === monster.pursuitProfile)) {
      issues.push({ path: `monsters.${monster.id}.pursuitProfile`, message: `unknown pursuit ${monster.pursuitProfile}` });
    }
    if (monster.rewardProfile && !registry.monsterRewardProfiles.some((profile) => profile.id === monster.rewardProfile)) {
      issues.push({ path: `monsters.${monster.id}.rewardProfile`, message: `unknown reward profile ${monster.rewardProfile}` });
    }
  }

  for (const encounter of registry.encounters) {
    if (!ENCOUNTER_ROLES.includes(encounter.role as (typeof ENCOUNTER_ROLES)[number])) {
      issues.push({ path: `encounters.${encounter.id}.role`, message: `invalid role ${encounter.role}` });
    }
    if (!PLACEMENT_PATTERNS.includes(encounter.pattern as (typeof PLACEMENT_PATTERNS)[number])) {
      issues.push({ path: `encounters.${encounter.id}.pattern`, message: `invalid pattern ${encounter.pattern}` });
    }
    if (encounter.weight < 0) {
      issues.push({ path: `encounters.${encounter.id}.weight`, message: "negative weight" });
    }
    for (const slot of encounter.slots) {
      requireRef(issues, `encounters.${encounter.id}.slots`, slot.monsterId, registry.byId.monster.has(slot.monsterId));
    }
  }

  for (const guardian of registry.guardianEncounters) {
    requireRef(issues, `guardianEncounters.${guardian.id}`, guardian.monsterId, registry.byId.monster.has(guardian.monsterId));
  }
  requireRef(issues, "bossEncounter.bossId", registry.bossEncounter.bossId, registry.byId.monster.has(registry.bossEncounter.bossId));
  requireRef(
    issues,
    "bossEncounter.arenaId",
    registry.bossEncounter.arenaId,
    registry.structureTemplates.some((template) => template.id === registry.bossEncounter.arenaId),
  );

  for (const profile of registry.monsterRewardProfiles) {
    for (const drop of profile.drops) {
      requireRef(issues, `monsterRewardProfiles.${profile.id}`, drop, registry.byId.item.has(drop));
    }
  }

  for (const reward of registry.fixedRewards) {
    if (reward.itemId) {
      requireRef(issues, `fixedRewards.${reward.id}`, reward.itemId, registry.byId.item.has(reward.itemId));
    }
    if (reward.learnAbilityId) {
      requireRef(issues, `fixedRewards.${reward.id}`, reward.learnAbilityId, registry.byId.ability.has(reward.learnAbilityId));
    }
  }

  for (const shop of registry.shopTypes) {
    for (const itemId of [...shop.stapleItemIds, ...shop.limitedPoolItemIds]) {
      requireRef(issues, `shopTypes.${shop.id}`, itemId, registry.byId.item.has(itemId));
    }
    if (shop.limitedPickCount < 0 || shop.maxRareExtras < 0) {
      issues.push({ path: `shopTypes.${shop.id}`, message: "negative shop generation counts" });
    }
  }

  for (const instance of registry.shopInstances) {
    requireRef(issues, `shopInstances.${instance.id}.type`, instance.shopTypeId, registry.byId.shopType.has(instance.shopTypeId));
    if (instance.npcId) {
      requireRef(issues, `shopInstances.${instance.id}.npc`, instance.npcId, registry.byId.storyNpc.has(instance.npcId));
    }
    if (instance.anchorNpcId) {
      requireRef(issues, `shopInstances.${instance.id}.anchorNpc`, instance.anchorNpcId, registry.byId.storyNpc.has(instance.anchorNpcId));
    }
    for (const stock of instance.specialStock) {
      requireRef(issues, `shopInstances.${instance.id}.stock`, stock.itemId, registry.byId.item.has(stock.itemId));
      if (stock.priceOverride !== null && stock.priceOverride < 0) {
        issues.push({ path: `shopInstances.${instance.id}.stock.${stock.itemId}`, message: "negative price override" });
      }
    }
  }

  for (const npc of registry.storyNpcs) {
    requireRef(issues, `storyNpcs.${npc.id}`, npc.archetypeId, registry.byId.npcArchetype.has(npc.archetypeId));
  }

  for (const archetype of registry.npcArchetypes) {
    if (archetype.dimensionMin < 0 || archetype.dimensionMax > 15 || archetype.dimensionMin > archetype.dimensionMax) {
      issues.push({ path: `npcArchetypes.${archetype.id}`, message: "illegal dimension eligibility range" });
    }
  }

  const authoredFlags = new Set(registry.worldFlags);
  for (const quest of registry.quests) {
    if (quest.giver) {
      requireRef(issues, `quests.${quest.id}.giver`, quest.giver, registry.byId.storyNpc.has(quest.giver));
    }
    if (quest.rewards.apEventId) {
      requireRef(
        issues,
        `quests.${quest.id}.rewards.apEventId`,
        quest.rewards.apEventId,
        registry.apRewardEvents.some((event) => event.id === quest.rewards.apEventId),
      );
    }
    for (const abilityId of quest.rewards.learnAbilityIds) {
      requireRef(issues, `quests.${quest.id}.rewards.learnAbilityIds`, abilityId, registry.byId.ability.has(abilityId));
    }
    for (const flagId of quest.rewards.flagIds) {
      if (!authoredFlags.has(flagId)) {
        issues.push({ path: `quests.${quest.id}.rewards.flagIds`, message: `unknown flag ${flagId}` });
      }
    }
    if (
      quest.rewards.coinMin !== undefined &&
      quest.rewards.coinMax !== undefined &&
      quest.rewards.coinMin > quest.rewards.coinMax
    ) {
      issues.push({ path: `quests.${quest.id}.rewards.coin`, message: "coinMin greater than coinMax" });
    }
    for (const [index, objective] of quest.objectives.entries()) {
      if (objective.type === "defeat_encounter") {
        const known =
          registry.guardianEncounters.some((row) => row.id === objective.encounterId) ||
          objective.encounterId === registry.bossEncounter.id;
        requireRef(issues, `quests.${quest.id}.objectives[${index}]`, objective.encounterId, known);
      }
      if (objective.type === "reach_dimension" && (objective.dimension < 0 || objective.dimension > 15)) {
        issues.push({ path: `quests.${quest.id}.objectives[${index}]`, message: `illegal dimension ${objective.dimension}` });
      }
    }
  }

  for (const acquisition of registry.abilityAcquisitions) {
    requireRef(issues, `abilityAcquisitions.${acquisition.abilityId}`, acquisition.abilityId, registry.byId.ability.has(acquisition.abilityId));
    if (acquisition.questId) {
      requireRef(issues, `abilityAcquisitions.${acquisition.abilityId}.questId`, acquisition.questId, registry.byId.quest.has(acquisition.questId));
    }
    if (acquisition.giverNpcId) {
      requireRef(issues, `abilityAcquisitions.${acquisition.abilityId}.giverNpcId`, acquisition.giverNpcId, registry.byId.storyNpc.has(acquisition.giverNpcId));
    }
    if (acquisition.fixedRewardId) {
      requireRef(
        issues,
        `abilityAcquisitions.${acquisition.abilityId}.fixedRewardId`,
        acquisition.fixedRewardId,
        registry.fixedRewards.some((reward) => reward.id === acquisition.fixedRewardId),
      );
    }
    if (acquisition.prerequisiteEncounterId) {
      requireRef(
        issues,
        `abilityAcquisitions.${acquisition.abilityId}.prerequisiteEncounterId`,
        acquisition.prerequisiteEncounterId,
        registry.guardianEncounters.some((row) => row.id === acquisition.prerequisiteEncounterId),
      );
    }
  }

  uniqueIds("primitiveProfiles", registry.primitiveProfiles.map((row) => row.id), issues);
  uniqueIds("featureRecipes", registry.featureRecipes.map((row) => row.id), issues);
  for (const profile of registry.primitiveProfiles) {
    validatePrimitiveProfile(profile, issues);
  }
  for (const recipe of registry.featureRecipes) {
    for (const [index, step] of recipe.steps.entries()) {
      if (step.primitiveId) {
        requireRef(issues, `featureRecipes.${recipe.id}.steps[${index}]`, step.primitiveId, registry.byId.primitiveProfile.has(step.primitiveId));
      }
      if (step.templateId) {
        requireRef(
          issues,
          `featureRecipes.${recipe.id}.steps[${index}]`,
          step.templateId,
          registry.structureTemplates.some((template) => template.id === step.templateId),
        );
      }
      if (step.featureId) {
        requireRef(issues, `featureRecipes.${recipe.id}.steps[${index}]`, step.featureId, registry.byId.feature.has(step.featureId));
      }
      if (step.tileId) {
        requireRef(issues, `featureRecipes.${recipe.id}.steps[${index}]`, step.tileId, registry.byId.tile.has(step.tileId));
      }
    }
  }

  for (const family of registry.planeFamilies) {
    requireRef(issues, `planeFamilies.${family.id}.visibility`, family.defaultVisibility, registry.visibilityProfiles.some((profile) => profile.id === family.defaultVisibility));
    if (family.walkableTargetMin > family.walkableTargetMax) {
      issues.push({ path: `planeFamilies.${family.id}.walkable`, message: "min greater than max" });
    }
    if (family.majorRegionsMin > family.majorRegionsMax || family.structuresMin > family.structuresMax) {
      issues.push({ path: `planeFamilies.${family.id}`, message: "illegal generation range" });
    }
    if (family.hazardDensityMinPercent > family.hazardDensityMaxPercent) {
      issues.push({ path: `planeFamilies.${family.id}.hazardDensity`, message: "min greater than max" });
    }
  }

  for (const hazard of registry.hazards) {
    for (const effectId of hazard.effectIds) {
      requireRef(issues, `hazards.${hazard.id}`, effectId, registry.byId.effect.has(effectId));
    }
  }

  for (const tile of registry.tileTypes) {
    if (tile.hazardId) {
      requireRef(issues, `tileTypes.${tile.id}.hazardId`, tile.hazardId, registry.byId.hazard.has(tile.hazardId));
    }
  }

  const loadout = registry.startingLoadout;
  requireRef(issues, "startingLoadout.weapon", loadout.equippedWeapon, registry.byId.item.has(loadout.equippedWeapon));
  requireRef(issues, "startingLoadout.body", loadout.equippedBody, registry.byId.item.has(loadout.equippedBody));
  for (const stack of loadout.inventory) {
    requireRef(issues, "startingLoadout.inventory", stack.itemId, registry.byId.item.has(stack.itemId));
  }

  requireRef(issues, "victory.bossId", registry.victory.bossId, registry.byId.monster.has(registry.victory.bossId));
  requireRef(issues, "victory.encounterId", registry.victory.encounterId, registry.victory.encounterId === registry.bossEncounter.id);

  return issues;
}

export function assertContentRegistryValid(registry: ContentRegistry = CONTENT_REGISTRY): void {
  const issues = validateContentRegistry(registry);
  if (issues.length > 0) {
    const text = issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Content registry invalid:\n${text}`);
  }
}
