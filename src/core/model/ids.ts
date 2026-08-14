/** Stable catalogue IDs are lowercase snake_case strings. */
export type CatalogueId = string;

export type AttributeId =
  | "str"
  | "dex"
  | "con"
  | "spd"
  | "wis"
  | "int"
  | "cha"
  | "psy";

export type FamilyId =
  | "aboveground"
  | "inside"
  | "dungeon"
  | "arcane"
  | "ethereal"
  | "space"
  | "void"
  | "olympus";

export type AttackChannelId =
  | "physical"
  | "finesse"
  | "endurance"
  | "speed"
  | "divine"
  | "arcane"
  | "social"
  | "psychic";

export type DamageTypeId =
  | "physical"
  | "piercing"
  | "fire"
  | "cold"
  | "poison"
  | "arcane"
  | "ethereal"
  | "psychic"
  | "void"
  | "divine"
  | "environmental";

export type ChannelStateId = "blocked" | "suppressed" | "normal" | "empowered";

export type ResistanceStateId = "immune" | "resistant" | "normal" | "vulnerable";

export type RarityId = "common" | "uncommon" | "rare" | "unique";

export type EquipmentSlotId =
  | "weapon"
  | "offhand"
  | "body"
  | "head"
  | "charm"
  | "artefact";

export type TargetingShapeId =
  | "adjacent"
  | "single"
  | "line"
  | "radius1"
  | "radius2"
  | "cross1";

export type ScalingRuleId = "single" | "average2" | "max2" | "min2" | "none";

export const SCALING_RULES = ["single", "average2", "max2", "min2", "none"] as const;

export type GeneratorVersionId = "tight-v1";
