import type { EncounterDefinition } from "../model/content-types";

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

export const ENCOUNTERS: readonly EncounterDefinition[] = [
  { id: "rats", tierMin: 0, tierMax: 3, role: "pack", pattern: "cluster", weight: 5, slots: [{ monsterId: "rat", min: 2, max: 4, optional: false }] },
  { id: "wolves", tierMin: 1, tierMax: 4, role: "pack", pattern: "scatter", weight: 4, slots: [{ monsterId: "wolf", min: 2, max: 3, optional: false }] },
  { id: "bandit_pair", tierMin: 1, tierMax: 5, role: "mixed", pattern: "scatter", weight: 4, slots: [{ monsterId: "bandit", min: 1, max: 1, optional: false }, { monsterId: "bandit_archer", min: 1, max: 1, optional: false }] },
  { id: "bandit_patrol", tierMin: 2, tierMax: 5, role: "mixed", pattern: "line", weight: 2, slots: [{ monsterId: "bandit", min: 2, max: 2, optional: false }, { monsterId: "bandit_archer", min: 1, max: 1, optional: false }] },
  { id: "cave_ambush", tierMin: 4, tierMax: 7, role: "ambush", pattern: "hidden_edge", weight: 5, slots: [{ monsterId: "cave_crawler", min: 1, max: 2, optional: false }] },
  { id: "golem_guard", tierMin: 4, tierMax: 8, role: "guard", pattern: "guard_door", weight: 3, slots: [{ monsterId: "stone_golem", min: 1, max: 1, optional: false }] },
  { id: "ruin_mix", tierMin: 5, tierMax: 8, role: "mixed", pattern: "room", weight: 2, slots: [{ monsterId: "cave_crawler", min: 1, max: 1, optional: false }, { monsterId: "stone_golem", min: 1, max: 1, optional: false }] },
  { id: "arcane_hunt", tierMin: 6, tierMax: 9, role: "mixed", pattern: "scatter", weight: 5, slots: [{ monsterId: "rune_hound", min: 1, max: 1, optional: false }, { monsterId: "living_spell", min: 1, max: 1, optional: false }] },
  { id: "arcane_pack", tierMin: 6, tierMax: 9, role: "pack", pattern: "scatter", weight: 3, slots: [{ monsterId: "rune_hound", min: 2, max: 2, optional: false }] },
  { id: "spell_nest", tierMin: 7, tierMax: 10, role: "pack", pattern: "room", weight: 2, slots: [{ monsterId: "living_spell", min: 2, max: 2, optional: false }] },
  { id: "ghost_haunt", tierMin: 8, tierMax: 11, role: "mixed", pattern: "room", weight: 5, slots: [{ monsterId: "ghost", min: 1, max: 1, optional: false }, { monsterId: "nightmare", min: 0, max: 1, optional: true }] },
  { id: "spirit_pack", tierMin: 8, tierMax: 11, role: "pack", pattern: "scatter", weight: 3, slots: [{ monsterId: "ghost", min: 2, max: 2, optional: false }] },
  { id: "nightmare_ambush", tierMin: 9, tierMax: 12, role: "ambush", pattern: "hidden_edge", weight: 3, slots: [{ monsterId: "nightmare", min: 1, max: 1, optional: false }] },
  { id: "orbital_patrol", tierMin: 10, tierMax: 13, role: "mixed", pattern: "scatter", weight: 5, slots: [{ monsterId: "orbital_drone", min: 1, max: 1, optional: false }, { monsterId: "gravity_predator", min: 1, max: 1, optional: false }] },
  { id: "drone_line", tierMin: 10, tierMax: 13, role: "pack", pattern: "line", weight: 3, slots: [{ monsterId: "orbital_drone", min: 2, max: 2, optional: false }] },
  { id: "gravity_hunt", tierMin: 11, tierMax: 14, role: "elite", pattern: "scatter", weight: 3, slots: [{ monsterId: "gravity_predator", min: 1, max: 1, optional: false }] },
  { id: "void_pack", tierMin: 12, tierMax: 15, role: "pack", pattern: "cluster", weight: 5, slots: [{ monsterId: "void_leech", min: 2, max: 4, optional: false }] },
  { id: "void_hunt", tierMin: 12, tierMax: 15, role: "mixed", pattern: "hidden_edge", weight: 5, slots: [{ monsterId: "blind_hunter", min: 1, max: 1, optional: false }, { monsterId: "void_leech", min: 1, max: 2, optional: false }] },
  { id: "blind_pair", tierMin: 13, tierMax: 15, role: "elite", pattern: "surround", weight: 2, slots: [{ monsterId: "blind_hunter", min: 2, max: 2, optional: false }] },
  { id: "divine_guard", tierMin: 14, tierMax: 15, role: "mixed", pattern: "guard_door", weight: 5, slots: [{ monsterId: "herald", min: 1, max: 1, optional: false }, { monsterId: "divine_beast", min: 1, max: 1, optional: false }] },
  { id: "beast_pair", tierMin: 14, tierMax: 15, role: "elite", pattern: "room", weight: 2, slots: [{ monsterId: "divine_beast", min: 2, max: 2, optional: false }] },
  { id: "herald_circle", tierMin: 14, tierMax: 15, role: "pack", pattern: "surround", weight: 2, slots: [{ monsterId: "herald", min: 2, max: 2, optional: false }] },
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
