import { CONTENT_REGISTRY } from "../data/registry";
import { GLOBAL_CONSTANTS } from "../model/constants";
import type { AttributeBlock, MonsterSpecies, ResistanceEntry } from "../model/content-types";
import type { AttributeId, DamageTypeId, FamilyId, ResistanceStateId } from "../model/ids";
import type { PlanePair } from "../model/plane";
import type { ActorState, SaveState } from "../model/save-state";
import { strongerResistance } from "./combat-math";

const ATTRIBUTE_IDS: readonly AttributeId[] = ["str", "dex", "con", "spd", "wis", "int", "cha", "psy"];

export function emptyAttributes(fill = 0): AttributeBlock {
  return { str: fill, dex: fill, con: fill, spd: fill, wis: fill, int: fill, cha: fill, psy: fill };
}

export function addAttributes(base: AttributeBlock, mods: Readonly<Partial<AttributeBlock>>): AttributeBlock {
  const next = { ...base };
  for (const id of ATTRIBUTE_IDS) {
    next[id] += mods[id] ?? 0;
  }
  return next;
}

export function dominantDimension(plane: PlanePair): number {
  return Math.max(plane.a, plane.b);
}

export function scaledMonster(species: MonsterSpecies, plane: PlanePair): { attributes: AttributeBlock; maxHp: number } {
  const dominant = dominantDimension(plane);
  const effectiveTier = Math.max(species.baseTier, dominant);
  const extraTiers = Math.max(0, effectiveTier - species.baseTier);
  const attributes = { ...species.attributes };
  const bumps = Math.floor(extraTiers / 3);
  for (let i = 0; i < bumps; i += 1) {
    const attr = species.scalingOrder[i % species.scalingOrder.length];
    if (attr) {
      attributes[attr] = Math.min(GLOBAL_CONSTANTS.permanentAttributeCap, attributes[attr] + 1);
    }
  }
  const baseHp = species.hpOverride ?? GLOBAL_CONSTANTS.baseHpConstant + GLOBAL_CONSTANTS.hpPerCon * attributes.con + species.hpModifier;
  return { attributes, maxHp: baseHp + extraTiers };
}

export function baseAttributes(save: SaveState, actor: ActorState): AttributeBlock {
  if (actor.kind === "player") {
    return { ...save.player.attributes };
  }
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  if (species) {
    return scaledMonster(species, actor.plane).attributes;
  }
  return emptyAttributes(GLOBAL_CONSTANTS.playerStartingAttribute);
}

function equippedItems(save: SaveState, actor: ActorState) {
  if (actor.kind !== "player") {
    return [];
  }
  return Object.values(save.player.equipment)
    .map((id) => (id ? CONTENT_REGISTRY.byId.item.get(id) : undefined))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
}

export function effectiveAttributes(save: SaveState, actor: ActorState): AttributeBlock {
  let attrs = baseAttributes(save, actor);
  if (actor.kind === "player") {
    for (const item of equippedItems(save, actor)) {
      attrs = addAttributes(attrs, item.combat.attributeMods);
    }
  }
  for (const instance of actor.statuses) {
    const status = CONTENT_REGISTRY.byId.status.get(instance.id);
    if (status) {
      attrs = addAttributes(attrs, status.attributeMods);
    }
  }
  return attrs;
}

export function effectiveInitiativeModifier(save: SaveState, actor: ActorState): number {
  let value = actor.initiativeModifier;
  if (actor.kind === "player") {
    for (const item of equippedItems(save, actor)) {
      value += item.combat.initiativeModifier;
    }
  }
  return value;
}

export function derivedMaxHp(save: SaveState, actor: ActorState): number {
  if (actor.kind === "player") {
    return GLOBAL_CONSTANTS.baseHpConstant + GLOBAL_CONSTANTS.hpPerCon * effectiveAttributes(save, actor).con;
  }
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  if (species) {
    return scaledMonster(species, actor.plane).maxHp;
  }
  return GLOBAL_CONSTANTS.baseHpConstant + GLOBAL_CONSTANTS.hpPerCon * GLOBAL_CONSTANTS.playerStartingAttribute;
}

export function syncDerivedMaxHp(save: SaveState, actor: ActorState): void {
  actor.maxHp = derivedMaxHp(save, actor);
  if (actor.hp > actor.maxHp) {
    actor.hp = actor.maxHp;
  }
}

export function resistanceFor(save: SaveState, actor: ActorState, damageType: DamageTypeId): ResistanceStateId {
  let state: ResistanceStateId = "normal";
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  const apply = (entry: ResistanceEntry): void => {
    if (entry.damageType === damageType) {
      state = strongerResistance(state, entry.state);
    }
  };
  if (species) {
    for (const entry of species.resistances) {
      apply(entry);
    }
  }
  if (actor.kind === "player") {
    for (const item of equippedItems(save, actor)) {
      for (const entry of item.combat.resistanceMods) {
        apply(entry);
      }
    }
  }
  for (const instance of actor.statuses) {
    const status = CONTENT_REGISTRY.byId.status.get(instance.id);
    if (status?.resistanceAtLeast && status.resistanceAtLeast.damageType === damageType) {
      state = strongerResistance(state, status.resistanceAtLeast.state);
    }
  }
  return state;
}

export function flatArmour(save: SaveState, actor: ActorState, damageType: DamageTypeId): number {
  let armour = 0;
  if (actor.kind === "player") {
    for (const item of equippedItems(save, actor)) {
      if (damageType === "physical") {
        armour += item.combat.armourPhysical;
      }
      if (damageType === "piercing") {
        armour += item.combat.armourPiercing;
      }
    }
  }
  if (damageType === "physical") {
    for (const instance of actor.statuses) {
      const status = CONTENT_REGISTRY.byId.status.get(instance.id);
      armour += status?.armourPhysicalBonus ?? 0;
    }
  }
  return armour;
}

export function channelStateForFamily(family: FamilyId, channel: string): "blocked" | "suppressed" | "normal" | "empowered" {
  const def = CONTENT_REGISTRY.planeFamilies.find((row) => row.id === family);
  if (!def) {
    return "normal";
  }
  return def.channelModifiers[channel as keyof typeof def.channelModifiers] ?? "normal";
}

export function actorPreventsIntentionalActions(actor: ActorState): boolean {
  return actor.statuses.some((row) => CONTENT_REGISTRY.byId.status.get(row.id)?.preventsIntentionalActions);
}

export function actorPreventsSpells(actor: ActorState): boolean {
  return actor.statuses.some((row) => CONTENT_REGISTRY.byId.status.get(row.id)?.preventsSpellAbilities);
}

export function actorIsHidden(actor: ActorState): boolean {
  return actor.statuses.some((row) => CONTENT_REGISTRY.byId.status.get(row.id)?.hidden);
}

export function actorIsBlinded(actor: ActorState): boolean {
  return actor.statuses.some((row) => CONTENT_REGISTRY.byId.status.get(row.id)?.blinds);
}

export function charmedSourceIds(actor: ActorState): string[] {
  return actor.statuses.filter((row) => row.id === "charmed" && row.sourceId).map((row) => row.sourceId!);
}

export function grantedAttackIds(save: SaveState, actor: ActorState): string[] {
  if (actor.kind === "player") {
    const ids: string[] = ["unarmed_strike"];
    for (const item of equippedItems(save, actor)) {
      ids.push(...item.attackIds);
    }
    return [...new Set(ids)];
  }
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  return species ? [...species.attackIds] : [];
}

export function grantedAbilityIds(save: SaveState, actor: ActorState): string[] {
  if (actor.kind === "player") {
    const ids = [...save.player.learnedAbilities];
    for (const item of equippedItems(save, actor)) {
      ids.push(...item.grantedAbilityIds);
    }
    return [...new Set(ids)];
  }
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  return species ? [...species.abilityIds] : [];
}

export function cooldownRemaining(actor: ActorState, id: string): number {
  return actor.cooldowns.find((row) => row.id === id)?.remainingTicks ?? 0;
}

export function startCooldown(actor: ActorState, id: string, ticks: number): void {
  if (ticks <= 0) {
    return;
  }
  const existing = actor.cooldowns.find((row) => row.id === id);
  if (existing) {
    existing.remainingTicks = Math.max(existing.remainingTicks, ticks);
    return;
  }
  actor.cooldowns.push({ id, remainingTicks: ticks });
}
