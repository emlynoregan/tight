import type { ContentRegistry } from "./registry";
import { CONTENT_REGISTRY } from "./registry";
import { ENCOUNTER_ROLES, PLACEMENT_PATTERNS } from "./encounters";
import { AI_PROFILES } from "./monsters";

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
  }

  for (const instance of registry.shopInstances) {
    requireRef(issues, `shopInstances.${instance.id}.type`, instance.shopTypeId, registry.byId.shopType.has(instance.shopTypeId));
    if (instance.npcId) {
      requireRef(issues, `shopInstances.${instance.id}.npc`, instance.npcId, registry.byId.storyNpc.has(instance.npcId));
    }
    for (const itemId of instance.specialStock) {
      requireRef(issues, `shopInstances.${instance.id}.stock`, itemId, registry.byId.item.has(itemId));
    }
  }

  for (const npc of registry.storyNpcs) {
    requireRef(issues, `storyNpcs.${npc.id}`, npc.archetypeId, registry.byId.npcArchetype.has(npc.archetypeId));
  }

  for (const quest of registry.quests) {
    if (quest.giver) {
      requireRef(issues, `quests.${quest.id}.giver`, quest.giver, registry.byId.storyNpc.has(quest.giver));
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

  for (const family of registry.planeFamilies) {
    requireRef(issues, `planeFamilies.${family.id}.visibility`, family.defaultVisibility, registry.visibilityProfiles.some((profile) => profile.id === family.defaultVisibility));
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
