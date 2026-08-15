import type { EncounterDefinition, EncounterSlot } from "../model/content-types";
import type { FamilyId } from "../model/ids";

export const ENCOUNTER_ROLES = ["pack", "mixed", "ambush", "guard", "elite"] as const;
export const PLACEMENT_PATTERNS = [
  "scatter",
  "cluster",
  "line",
  "surround",
  "guard_door",
  "room",
  "corridor",
  "hidden_edge",
  "fixed_stamp",
] as const;

function enc(
  id: string,
  tierMin: number,
  tierMax: number,
  role: EncounterDefinition["role"],
  pattern: EncounterDefinition["pattern"],
  weight: number,
  slots: readonly EncounterSlot[],
  families: readonly FamilyId[],
  extras: Partial<Pick<EncounterDefinition, "requiredTerrainTags" | "forbiddenTerrainTags" | "pureFamilyOnly">> = {},
): EncounterDefinition {
  return {
    id,
    tierMin,
    tierMax,
    role,
    pattern,
    weight,
    slots,
    eligibleFamilies: families,
    requiredTerrainTags: extras.requiredTerrainTags ?? [],
    forbiddenTerrainTags: extras.forbiddenTerrainTags ?? [],
    pureFamilyOnly: extras.pureFamilyOnly ?? false,
  };
}

const SURFACE: readonly FamilyId[] = ["aboveground", "inside"];
const DUNGEON: readonly FamilyId[] = ["dungeon"];
const ARCANE: readonly FamilyId[] = ["arcane"];
const ETHEREAL: readonly FamilyId[] = ["ethereal"];
const SPACE: readonly FamilyId[] = ["space"];
const VOID: readonly FamilyId[] = ["void"];
const OLYMPUS: readonly FamilyId[] = ["olympus"];

export const ENCOUNTERS: readonly EncounterDefinition[] = [
  enc("rats", 0, 3, "pack", "cluster", 5, [{ monsterId: "rat", min: 2, max: 4, optional: false }], SURFACE),
  enc("wolves", 1, 4, "pack", "scatter", 4, [{ monsterId: "wolf", min: 2, max: 3, optional: false }], ["aboveground"]),
  enc("bandit_pair", 1, 5, "mixed", "scatter", 4, [{ monsterId: "bandit", min: 1, max: 1, optional: false }, { monsterId: "bandit_archer", min: 1, max: 1, optional: false }], SURFACE),
  enc("bandit_patrol", 2, 5, "mixed", "line", 2, [{ monsterId: "bandit", min: 2, max: 2, optional: false }, { monsterId: "bandit_archer", min: 1, max: 1, optional: false }], SURFACE),
  enc("cave_ambush", 4, 7, "ambush", "hidden_edge", 5, [{ monsterId: "cave_crawler", min: 1, max: 2, optional: false }], DUNGEON, { requiredTerrainTags: ["dungeon"] }),
  enc("golem_guard", 4, 8, "guard", "guard_door", 3, [{ monsterId: "stone_golem", min: 1, max: 1, optional: false }], DUNGEON),
  enc("ruin_mix", 5, 8, "mixed", "room", 2, [{ monsterId: "cave_crawler", min: 1, max: 1, optional: false }, { monsterId: "stone_golem", min: 1, max: 1, optional: false }], DUNGEON),
  enc("arcane_hunt", 6, 9, "mixed", "scatter", 5, [{ monsterId: "rune_hound", min: 1, max: 1, optional: false }, { monsterId: "living_spell", min: 1, max: 1, optional: false }], ARCANE),
  enc("arcane_pack", 6, 9, "pack", "scatter", 3, [{ monsterId: "rune_hound", min: 2, max: 2, optional: false }], ARCANE),
  enc("spell_nest", 7, 10, "pack", "room", 2, [{ monsterId: "living_spell", min: 2, max: 2, optional: false }], ARCANE),
  enc("ghost_haunt", 8, 11, "mixed", "room", 5, [{ monsterId: "ghost", min: 1, max: 1, optional: false }, { monsterId: "nightmare", min: 0, max: 1, optional: true }], ETHEREAL),
  enc("spirit_pack", 8, 11, "pack", "scatter", 3, [{ monsterId: "ghost", min: 2, max: 2, optional: false }], ETHEREAL),
  enc("nightmare_ambush", 9, 12, "ambush", "hidden_edge", 3, [{ monsterId: "nightmare", min: 1, max: 1, optional: false }], ETHEREAL),
  enc("orbital_patrol", 10, 13, "mixed", "scatter", 5, [{ monsterId: "orbital_drone", min: 1, max: 1, optional: false }, { monsterId: "gravity_predator", min: 1, max: 1, optional: false }], SPACE),
  enc("drone_line", 10, 13, "pack", "line", 3, [{ monsterId: "orbital_drone", min: 2, max: 2, optional: false }], SPACE),
  enc("gravity_hunt", 11, 14, "elite", "scatter", 3, [{ monsterId: "gravity_predator", min: 1, max: 1, optional: false }], SPACE),
  enc("void_pack", 12, 15, "pack", "cluster", 5, [{ monsterId: "void_leech", min: 2, max: 4, optional: false }], VOID),
  enc("void_hunt", 12, 15, "mixed", "hidden_edge", 5, [{ monsterId: "blind_hunter", min: 1, max: 1, optional: false }, { monsterId: "void_leech", min: 1, max: 2, optional: false }], VOID),
  enc("blind_pair", 13, 15, "elite", "surround", 2, [{ monsterId: "blind_hunter", min: 2, max: 2, optional: false }], VOID),
  enc("divine_guard", 14, 15, "mixed", "guard_door", 5, [{ monsterId: "herald", min: 1, max: 1, optional: false }, { monsterId: "divine_beast", min: 1, max: 1, optional: false }], OLYMPUS),
  enc("beast_pair", 14, 15, "elite", "room", 2, [{ monsterId: "divine_beast", min: 2, max: 2, optional: false }], OLYMPUS),
  enc("herald_circle", 14, 15, "pack", "surround", 2, [{ monsterId: "herald", min: 2, max: 2, optional: false }], OLYMPUS),
];

export const GUARDIAN_ENCOUNTERS = [
  { id: "guardian_stone", monsterId: "golem_warden", bandMin: 4, bandMax: 7, rewardProfile: "guardian_standard" },
  { id: "guardian_spirit", monsterId: "dream_eater", bandMin: 8, bandMax: 10, rewardProfile: "guardian_standard" },
  { id: "guardian_space", monsterId: "black_orbit", bandMin: 10, bandMax: 12, rewardProfile: "guardian_major" },
  { id: "guardian_void", monsterId: "abyssal_sentinel", bandMin: 12, bandMax: 14, rewardProfile: "guardian_major" },
] as const;

export const BOSS_ENCOUNTER = {
  id: "boss_olympus",
  bossId: "olympian_final",
  plane: { a: 14, b: 15 },
  arenaId: "olympus_arena",
} as const;

export const DROP_CHANCES = [
  { id: "none", percent: 0 },
  { id: "rare", percent: 10 },
  { id: "occasional", percent: 25 },
  { id: "common", percent: 50 },
  { id: "guaranteed", percent: 100 },
] as const;

export const MONSTER_REWARD_PROFILES = [
  { id: "beast_small", currencyBonus: 0, itemChance: "occasional", drops: ["healing_herb", "herb"] },
  { id: "humanoid_basic", currencyBonus: 1, itemChance: "occasional", drops: ["healing_herb", "antidote"] },
  { id: "cave_creature", currencyBonus: 0, itemChance: "occasional", drops: ["ore"] },
  { id: "construct", currencyBonus: 1, itemChance: "rare", drops: ["ore", "crystal"] },
  { id: "arcane_creature", currencyBonus: 0, itemChance: "occasional", drops: ["crystal"] },
  { id: "spirit", currencyBonus: 0, itemChance: "common", drops: ["ectoplasm"] },
  { id: "space_entity", currencyBonus: 0, itemChance: "occasional", drops: ["star_matter"] },
  { id: "void_entity", currencyBonus: 0, itemChance: "common", drops: ["void_fragment"] },
  { id: "divine_entity", currencyBonus: 2, itemChance: "occasional", drops: ["divine_fragment"] },
] as const;

export const GUARDIAN_REWARD_PROFILES = [
  { id: "guardian_standard", currency: 12, ap: 1 },
  { id: "guardian_major", currency: 20, ap: 1 },
  { id: "boss_major", currency: 30, ap: 2 },
  { id: "boss_final", currency: 0, ap: 0 },
] as const;

export const CONTAINER_TYPES = [
  { id: "crate", className: "crate", quality: "mundane" },
  { id: "chest", className: "chest", quality: "useful" },
  { id: "locked_chest", className: "chest", quality: "rare" },
  { id: "cache", className: "cache", quality: "useful" },
  { id: "shrine_offering", className: "shrine", quality: "rare" },
  { id: "wreckage_cache", className: "wreckage", quality: "rare" },
  { id: "void_cache", className: "void", quality: "exceptional" },
  { id: "divine_reliquary", className: "divine", quality: "exceptional" },
] as const;

export const FIXED_REWARDS = [
  { id: "reward_echo", itemId: "echo", learnAbilityId: null },
  { id: "reward_still_stone", itemId: "still_stone", learnAbilityId: null },
  { id: "reward_lantern_nothing", itemId: "lantern_of_nothing", learnAbilityId: null },
  { id: "reward_second_hand", itemId: "second_hand", learnAbilityId: null },
  { id: "reward_phase_key", itemId: "phase_key", learnAbilityId: null },
  { id: "reward_arcane_gate", itemId: null, learnAbilityId: "arcane_gate" },
  { id: "reward_dream_step", itemId: null, learnAbilityId: "dream_step" },
  { id: "reward_void_slip", itemId: null, learnAbilityId: "void_slip" },
  { id: "reward_divine_passage", itemId: null, learnAbilityId: "divine_passage" },
] as const;

export const AP_REWARD_EVENTS = [
  { id: "ap_dimension_first_entry", ap: 1 },
  { id: "ap_guardian_defeat", ap: 1 },
  { id: "ap_major_quest", ap: 1 },
  { id: "ap_major_boss", ap: 2 },
] as const;
