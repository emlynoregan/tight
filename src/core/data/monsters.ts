import type { DamageTypeId, ResistanceStateId } from "../model/ids";
import type { AttributeBlock, BossDefinition, MonsterSpecies, ResistanceEntry } from "../model/content-types";

function attrs(
  str: number,
  dex: number,
  con: number,
  spd: number,
  wis: number,
  int: number,
  cha: number,
  psy: number,
): AttributeBlock {
  return { str, dex, con, spd, wis, int, cha, psy };
}

function resist(damageType: DamageTypeId, state: ResistanceStateId): ResistanceEntry {
  return { damageType, state };
}

function species(row: MonsterSpecies): MonsterSpecies {
  return row;
}

export const AI_PROFILES = [
  "stationary",
  "wanderer",
  "brute",
  "skirmisher",
  "sniper",
  "ambusher",
  "controller",
  "supporter",
  "coward",
  "guardian",
  "dimensional_hunter",
  "boss_scripted",
] as const;

export const PURSUIT_PROFILES = [
  { id: "pursuit_none", canCross: false, categories: [] as const, delay: 0, sameTransitionRequired: true },
  { id: "pursuit_mundane_slow", canCross: true, categories: ["mundane_passage"], delay: 3, sameTransitionRequired: true },
  { id: "pursuit_mundane", canCross: true, categories: ["mundane_passage", "climb"], delay: 2, sameTransitionRequired: true },
  { id: "pursuit_ethereal", canCross: true, categories: ["mundane_passage", "ethereal"], delay: 2, sameTransitionRequired: true },
  { id: "pursuit_arcane", canCross: true, categories: ["mundane_passage", "arcane"], delay: 2, sameTransitionRequired: true },
  { id: "pursuit_space", canCross: true, categories: ["mundane_passage", "space"], delay: 2, sameTransitionRequired: true },
  { id: "pursuit_void", canCross: true, categories: ["mundane_passage", "ethereal", "void"], delay: 1, sameTransitionRequired: false },
  { id: "pursuit_divine", canCross: true, categories: ["mundane_passage", "climb", "arcane", "ethereal", "space", "void", "divine"], delay: 1, sameTransitionRequired: false },
] as const;

export const MONSTERS: readonly MonsterSpecies[] = [
  species({ id: "rat", role: "swarm", baseTier: 0, attributes: attrs(2, 4, 2, 5, 2, 1, 1, 1), hpModifier: -2, hpOverride: null, aiProfile: "wanderer", detection: 4, attackIds: ["bite"], abilityIds: [], resistances: [], pursuitProfile: "pursuit_none", scalingOrder: ["spd", "dex", "con"], rewardProfile: "beast_small", traits: ["beast"], boss: false }),
  species({ id: "wolf", role: "brute", baseTier: 1, attributes: attrs(4, 4, 4, 6, 3, 1, 2, 2), hpModifier: 0, hpOverride: null, aiProfile: "brute", detection: 6, attackIds: ["bite"], abilityIds: [], resistances: [], pursuitProfile: "pursuit_mundane", scalingOrder: ["str", "spd", "con"], rewardProfile: "beast_small", traits: ["beast", "pursuer"], boss: false }),
  species({ id: "boar", role: "brute", baseTier: 1, attributes: attrs(6, 2, 6, 4, 2, 1, 1, 1), hpModifier: 2, hpOverride: null, aiProfile: "brute", detection: 4, attackIds: ["body_slam"], abilityIds: [], resistances: [resist("physical", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "str", "spd"], rewardProfile: "beast_small", traits: ["beast"], boss: false }),
  species({ id: "bandit", role: "brute", baseTier: 2, attributes: attrs(5, 4, 4, 4, 3, 3, 3, 2), hpModifier: 0, hpOverride: null, aiProfile: "brute", detection: 6, attackIds: ["sword_slash"], abilityIds: [], resistances: [], pursuitProfile: "pursuit_mundane", scalingOrder: ["str", "con", "dex"], rewardProfile: "humanoid_basic", traits: ["human", "door_user", "pursuer"], boss: false }),
  species({ id: "bandit_archer", role: "sniper", baseTier: 2, attributes: attrs(3, 6, 3, 4, 3, 3, 3, 2), hpModifier: -1, hpOverride: null, aiProfile: "sniper", detection: 8, attackIds: ["bow_shot"], abilityIds: [], resistances: [], pursuitProfile: "pursuit_mundane_slow", scalingOrder: ["dex", "spd", "con"], rewardProfile: "humanoid_basic", traits: ["human", "door_user"], boss: false }),
  species({ id: "cutpurse", role: "skirmisher", baseTier: 2, attributes: attrs(3, 7, 3, 6, 3, 4, 4, 2), hpModifier: -1, hpOverride: null, aiProfile: "skirmisher", detection: 6, attackIds: ["dagger_stab", "quick_cut"], abilityIds: [], resistances: [], pursuitProfile: "pursuit_mundane", scalingOrder: ["dex", "spd", "int"], rewardProfile: "humanoid_basic", traits: ["human", "door_user"], boss: false }),
  species({ id: "house_guard", role: "tank", baseTier: 3, attributes: attrs(5, 4, 7, 3, 4, 3, 4, 3), hpModifier: 3, hpOverride: null, aiProfile: "guardian", detection: 6, attackIds: ["spear_thrust", "shield_bash"], abilityIds: [], resistances: [resist("physical", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "str", "wis"], rewardProfile: "humanoid_basic", traits: ["human", "door_user"], boss: false }),
  species({ id: "cultist", role: "controller", baseTier: 3, attributes: attrs(2, 4, 3, 4, 5, 5, 5, 5), hpModifier: 0, hpOverride: null, aiProfile: "controller", detection: 6, attackIds: ["mind_spike"], abilityIds: ["confuse_ability"], resistances: [], pursuitProfile: "pursuit_mundane_slow", scalingOrder: ["psy", "int", "wis"], rewardProfile: "humanoid_basic", traits: ["human"], boss: false }),
  species({ id: "cave_crawler", role: "ambusher", baseTier: 4, attributes: attrs(5, 5, 5, 5, 2, 1, 1, 2), hpModifier: 0, hpOverride: null, aiProfile: "ambusher", inPlaneAi: "brute", detection: 4, attackIds: ["venom_bite"], abilityIds: ["venom_attack"], resistances: [resist("poison", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "str", "dex"], rewardProfile: "cave_creature", traits: ["beast"], boss: false }),
  species({ id: "stone_beetle", role: "tank", baseTier: 4, attributes: attrs(4, 2, 9, 2, 2, 1, 1, 1), hpModifier: 4, hpOverride: null, aiProfile: "brute", detection: 3, attackIds: ["body_slam"], abilityIds: [], resistances: [resist("physical", "resistant"), resist("piercing", "resistant"), resist("poison", "immune")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "str"], rewardProfile: "cave_creature", traits: ["beast", "poison_immune"], boss: false }),
  species({ id: "burrower", role: "ambusher", baseTier: 5, attributes: attrs(6, 4, 6, 5, 2, 2, 1, 2), hpModifier: 1, hpOverride: null, aiProfile: "ambusher", inPlaneAi: "brute", detection: 4, attackIds: ["bite", "body_slam"], abilityIds: [], resistances: [], pursuitProfile: "pursuit_none", scalingOrder: ["str", "con", "spd"], rewardProfile: "cave_creature", traits: ["beast"], boss: false }),
  species({ id: "stone_golem", role: "tank", baseTier: 5, attributes: attrs(9, 1, 10, 1, 4, 2, 1, 2), hpModifier: 8, hpOverride: null, aiProfile: "guardian", detection: 6, attackIds: ["hammer_blow", "body_slam"], abilityIds: [], resistances: [resist("physical", "resistant"), resist("piercing", "resistant"), resist("poison", "immune"), resist("psychic", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "str", "wis"], rewardProfile: "construct", traits: ["construct", "poison_immune"], boss: false }),
  species({ id: "spark_elemental", role: "skirmisher", baseTier: 6, attributes: attrs(2, 5, 4, 8, 3, 7, 2, 5), hpModifier: 0, hpOverride: null, aiProfile: "skirmisher", detection: 6, attackIds: ["arcane_bolt", "lightning_dash"], abilityIds: [], resistances: [resist("arcane", "resistant"), resist("physical", "vulnerable")], pursuitProfile: "pursuit_arcane", scalingOrder: ["int", "spd", "psy"], rewardProfile: "arcane_creature", traits: ["arcane_creature", "pursuer"], boss: false }),
  species({ id: "rune_hound", role: "pursuer", baseTier: 6, attributes: attrs(6, 5, 5, 7, 3, 5, 1, 5), hpModifier: 1, hpOverride: null, aiProfile: "dimensional_hunter", inPlaneAi: "brute", detection: 8, attackIds: ["bite", "arcane_bolt"], abilityIds: [], resistances: [], pursuitProfile: "pursuit_arcane", scalingOrder: ["spd", "str", "int"], rewardProfile: "arcane_creature", traits: ["arcane_creature", "pursuer"], boss: false }),
  species({ id: "living_spell", role: "controller", baseTier: 7, attributes: attrs(1, 4, 4, 5, 4, 9, 1, 7), hpModifier: 0, hpOverride: null, aiProfile: "controller", detection: 8, attackIds: ["fire_bolt", "frost_bolt", "arcane_pulse"], abilityIds: ["burning_bolt", "freezing_bolt"], resistances: [resist("arcane", "resistant"), resist("poison", "immune")], pursuitProfile: "pursuit_arcane", scalingOrder: ["int", "psy", "spd"], rewardProfile: "arcane_creature", traits: ["arcane_creature", "poison_immune"], boss: false }),
  species({ id: "crystal_mage", role: "controller", baseTier: 7, attributes: attrs(2, 4, 4, 4, 5, 10, 3, 6), hpModifier: 1, hpOverride: null, aiProfile: "controller", detection: 8, attackIds: ["rune_lance", "stun_blast"], abilityIds: ["force_push"], resistances: [resist("arcane", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["int", "wis", "psy"], rewardProfile: "arcane_creature", traits: ["human", "arcane_creature"], boss: false }),
  species({ id: "ghost", role: "pursuer", baseTier: 8, attributes: attrs(1, 4, 4, 6, 6, 4, 4, 9), hpModifier: 0, hpOverride: null, aiProfile: "dimensional_hunter", detection: 8, attackIds: ["spectral_claw"], abilityIds: ["fear_touch_ability"], resistances: [resist("physical", "immune"), resist("piercing", "immune"), resist("ethereal", "normal"), resist("divine", "vulnerable")], pursuitProfile: "pursuit_ethereal", scalingOrder: ["psy", "spd", "wis"], rewardProfile: "spirit", traits: ["spirit", "phase_body", "pursuer"], boss: false }),
  species({ id: "wraith", role: "brute", baseTier: 8, attributes: attrs(3, 5, 6, 7, 5, 3, 2, 10), hpModifier: 2, hpOverride: null, aiProfile: "brute", detection: 8, attackIds: ["spectral_claw", "soul_drain"], abilityIds: [], resistances: [resist("physical", "immune"), resist("piercing", "immune"), resist("ethereal", "resistant"), resist("divine", "vulnerable")], pursuitProfile: "pursuit_ethereal", scalingOrder: ["psy", "con", "spd"], rewardProfile: "spirit", traits: ["spirit", "phase_body", "pursuer"], boss: false }),
  species({ id: "memory_shade", role: "controller", baseTier: 9, attributes: attrs(1, 4, 4, 5, 7, 5, 5, 10), hpModifier: 0, hpOverride: null, aiProfile: "controller", detection: 6, attackIds: ["mind_spike"], abilityIds: ["confuse_ability"], resistances: [resist("physical", "immune"), resist("psychic", "resistant"), resist("divine", "vulnerable")], pursuitProfile: "pursuit_none", scalingOrder: ["psy", "wis", "int"], rewardProfile: "spirit", traits: ["spirit", "phase_body"], boss: false }),
  species({ id: "nightmare", role: "ambusher", baseTier: 9, attributes: attrs(4, 6, 6, 8, 4, 4, 5, 11), hpModifier: 2, hpOverride: null, aiProfile: "ambusher", inPlaneAi: "controller", detection: 8, attackIds: ["dream_bite", "psychic_wave"], abilityIds: ["confusing_wave", "fear_touch_ability"], resistances: [resist("psychic", "resistant"), resist("divine", "vulnerable")], pursuitProfile: "pursuit_ethereal", scalingOrder: ["psy", "spd", "con"], rewardProfile: "spirit", traits: ["spirit", "pursuer"], boss: false }),
  species({ id: "vacuum_crawler", role: "swarm", baseTier: 10, attributes: attrs(5, 4, 8, 5, 2, 2, 1, 3), hpModifier: 2, hpOverride: null, aiProfile: "brute", detection: 6, attackIds: ["bite"], abilityIds: [], resistances: [resist("cold", "resistant"), resist("poison", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "str", "spd"], rewardProfile: "space_entity", traits: ["space_native"], boss: false }),
  species({ id: "orbital_drone", role: "sniper", baseTier: 10, attributes: attrs(2, 7, 6, 6, 2, 10, 1, 2), hpModifier: 1, hpOverride: null, aiProfile: "sniper", detection: 8, attackIds: ["machine_bolt"], abilityIds: ["gravity_push"], resistances: [resist("poison", "immune"), resist("psychic", "resistant")], pursuitProfile: "pursuit_space", scalingOrder: ["int", "dex", "spd"], rewardProfile: "space_entity", traits: ["construct", "space_native", "poison_immune", "door_user"], boss: false }),
  species({ id: "star_jelly", role: "controller", baseTier: 11, attributes: attrs(2, 4, 8, 5, 4, 5, 1, 8), hpModifier: 3, hpOverride: null, aiProfile: "controller", detection: 6, attackIds: ["psychic_wave", "arcane_pulse"], abilityIds: [], resistances: [resist("piercing", "resistant"), resist("cold", "immune")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "psy", "int"], rewardProfile: "space_entity", traits: ["space_native"], boss: false }),
  species({ id: "gravity_predator", role: "pursuer", baseTier: 11, attributes: attrs(7, 5, 8, 8, 4, 8, 1, 6), hpModifier: 4, hpOverride: null, aiProfile: "dimensional_hunter", inPlaneAi: "skirmisher", detection: 8, attackIds: ["momentum_strike", "gravity_pulse"], abilityIds: ["gravity_pull"], resistances: [resist("physical", "resistant")], pursuitProfile: "pursuit_space", scalingOrder: ["spd", "con", "int"], rewardProfile: "space_entity", traits: ["space_native", "pursuer"], boss: false }),
  species({ id: "void_leech", role: "swarm", baseTier: 12, attributes: attrs(4, 5, 7, 6, 2, 2, 1, 9), hpModifier: 0, hpOverride: null, aiProfile: "brute", detection: 8, attackIds: ["void_touch"], abilityIds: [], resistances: [resist("void", "resistant"), resist("psychic", "resistant")], pursuitProfile: "pursuit_void", scalingOrder: ["psy", "con", "spd"], rewardProfile: "void_entity", traits: ["void_native", "ignore_darkness", "pursuer"], boss: false }),
  species({ id: "lurker", role: "ambusher", baseTier: 12, attributes: attrs(6, 7, 7, 7, 4, 4, 1, 10), hpModifier: 2, hpOverride: null, aiProfile: "ambusher", inPlaneAi: "brute", detection: 8, attackIds: ["void_touch", "fear_touch"], abilityIds: ["fear_touch_ability"], resistances: [resist("void", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["psy", "dex", "str"], rewardProfile: "void_entity", traits: ["void_native", "ignore_darkness"], boss: false }),
  species({ id: "blind_hunter", role: "pursuer", baseTier: 13, attributes: attrs(8, 6, 9, 8, 3, 3, 1, 11), hpModifier: 5, hpOverride: null, aiProfile: "dimensional_hunter", detection: "unlimited", attackIds: ["void_touch", "soul_drain"], abilityIds: ["void_anchor"], resistances: [resist("void", "resistant"), resist("psychic", "resistant")], pursuitProfile: "pursuit_void", scalingOrder: ["psy", "con", "str"], rewardProfile: "void_entity", traits: ["void_native", "ignore_darkness", "ignore_los_detection", "pursuer"], boss: false }),
  species({ id: "dimensional_parasite", role: "controller", baseTier: 13, attributes: attrs(3, 5, 8, 6, 4, 7, 1, 12), hpModifier: 3, hpOverride: null, aiProfile: "controller", detection: 8, attackIds: ["void_bolt", "anchor_target"], abilityIds: ["void_anchor", "confuse_ability"], resistances: [resist("void", "resistant"), resist("poison", "immune")], pursuitProfile: "pursuit_void", scalingOrder: ["psy", "int", "con"], rewardProfile: "void_entity", traits: ["void_native", "poison_immune", "pursuer"], boss: false }),
  species({ id: "herald", role: "controller", baseTier: 14, attributes: attrs(5, 6, 8, 7, 12, 8, 11, 9), hpModifier: 5, hpOverride: null, aiProfile: "controller", detection: 8, attackIds: ["divine_lance", "divine_command"], abilityIds: ["divine_command_ability", "silence_ability"], resistances: [resist("divine", "resistant"), resist("psychic", "resistant"), resist("void", "resistant")], pursuitProfile: "pursuit_divine", scalingOrder: ["wis", "cha", "psy"], rewardProfile: "divine_entity", traits: ["divine", "pursuer"], boss: false }),
  species({ id: "angelic_guard", role: "tank", baseTier: 14, attributes: attrs(10, 6, 12, 5, 11, 6, 8, 8), hpModifier: 10, hpOverride: null, aiProfile: "guardian", detection: 8, attackIds: ["holy_strike", "radiant_cross"], abilityIds: [], resistances: [resist("divine", "resistant"), resist("physical", "resistant"), resist("void", "resistant")], pursuitProfile: "pursuit_none", scalingOrder: ["con", "wis", "str"], rewardProfile: "divine_entity", traits: ["divine"], boss: false }),
  species({ id: "divine_beast", role: "pursuer", baseTier: 15, attributes: attrs(12, 7, 12, 10, 9, 5, 5, 9), hpModifier: 10, hpOverride: null, aiProfile: "dimensional_hunter", inPlaneAi: "brute", detection: 8, attackIds: ["body_slam", "holy_strike"], abilityIds: [], resistances: [resist("divine", "resistant"), resist("physical", "resistant")], pursuitProfile: "pursuit_divine", scalingOrder: ["str", "con", "spd"], rewardProfile: "divine_entity", traits: ["divine", "pursuer"], boss: false }),
  species({ id: "demigod", role: "skirmisher", baseTier: 15, attributes: attrs(9, 9, 10, 9, 12, 10, 12, 11), hpModifier: 12, hpOverride: null, aiProfile: "controller", detection: 8, attackIds: ["judgement", "reality_cut", "celestial_burst"], abilityIds: [], resistances: [resist("divine", "resistant"), resist("psychic", "resistant"), resist("void", "resistant")], pursuitProfile: "pursuit_divine", scalingOrder: ["wis", "cha", "psy"], rewardProfile: "divine_entity", traits: ["divine", "pursuer"], boss: false }),
  species({ id: "golem_warden", role: "guardian", baseTier: 5, attributes: attrs(10, 2, 12, 2, 5, 4, 1, 3), hpModifier: 0, hpOverride: 42, aiProfile: "boss_scripted", detection: 6, attackIds: ["hammer_blow", "body_slam", "gravity_hammer"], abilityIds: [], resistances: [resist("physical", "resistant"), resist("piercing", "resistant"), resist("poison", "immune")], pursuitProfile: "pursuit_none", scalingOrder: [], rewardProfile: null, traits: ["construct", "boss", "poison_immune"], boss: true, guardianOf: { a: 4, b: 5 } }),
  species({ id: "rune_archon", role: "guardian", baseTier: 7, attributes: attrs(3, 6, 8, 7, 7, 13, 6, 10), hpModifier: 0, hpOverride: 38, aiProfile: "boss_scripted", detection: 8, attackIds: ["rune_lance", "stun_blast", "arcane_pulse", "lightning_dash"], abilityIds: [], resistances: [resist("arcane", "resistant")], pursuitProfile: "pursuit_arcane", scalingOrder: [], rewardProfile: null, traits: ["arcane_creature", "boss"], boss: true }),
  species({ id: "dream_eater", role: "guardian", baseTier: 9, attributes: attrs(5, 7, 9, 8, 8, 6, 7, 14), hpModifier: 0, hpOverride: 42, aiProfile: "boss_scripted", detection: 8, attackIds: ["dream_bite", "fear_touch", "psychic_wave", "possession_touch"], abilityIds: [], resistances: [resist("physical", "immune"), resist("psychic", "resistant"), resist("divine", "vulnerable")], pursuitProfile: "pursuit_ethereal", scalingOrder: [], rewardProfile: null, traits: ["spirit", "boss"], boss: true, guardianOf: { a: 8, b: 9 } }),
  species({ id: "black_orbit", role: "guardian", baseTier: 11, attributes: attrs(8, 7, 11, 10, 5, 13, 1, 8), hpModifier: 0, hpOverride: 46, aiProfile: "boss_scripted", detection: 8, attackIds: ["star_lance", "machine_bolt", "gravity_pulse", "lightning_dash"], abilityIds: [], resistances: [resist("physical", "resistant"), resist("poison", "immune")], pursuitProfile: "pursuit_space", scalingOrder: [], rewardProfile: null, traits: ["space_native", "boss", "poison_immune"], boss: true, guardianOf: { a: 10, b: 11 } }),
  species({ id: "abyssal_sentinel", role: "guardian", baseTier: 13, attributes: attrs(9, 7, 12, 8, 6, 8, 1, 15), hpModifier: 0, hpOverride: 52, aiProfile: "boss_scripted", detection: 8, attackIds: ["void_bolt", "anchor_target", "abyssal_pulse", "soul_drain"], abilityIds: [], resistances: [resist("void", "resistant"), resist("psychic", "resistant")], pursuitProfile: "pursuit_void", scalingOrder: [], rewardProfile: null, traits: ["void_native", "boss"], boss: true, guardianOf: { a: 12, b: 13 } }),
  species({ id: "olympian_final", role: "boss", baseTier: 15, attributes: attrs(12, 11, 14, 11, 15, 13, 15, 14), hpModifier: 0, hpOverride: 64, aiProfile: "boss_scripted", detection: 8, attackIds: ["divine_lance", "divine_command", "judgement", "reality_cut", "lightning_dash", "celestial_burst", "annihilation"], abilityIds: [], resistances: [resist("divine", "resistant"), resist("psychic", "resistant"), resist("void", "resistant"), resist("physical", "resistant")], pursuitProfile: "pursuit_divine", scalingOrder: [], rewardProfile: null, traits: ["divine", "boss"], boss: true, guardianOf: { a: 14, b: 15 } }),
];

export const BOSSES: readonly BossDefinition[] = [
  { id: "golem_warden", speciesId: "golem_warden", phases: [
    { name: "phase1", hpAtMostPercent: null, ai: "guardian", attackIds: ["hammer_blow", "body_slam"] },
    { name: "phase2", hpAtMostPercent: 50, ai: "brute", attackIds: ["hammer_blow", "body_slam", "gravity_hammer"] },
  ] },
  { id: "rune_archon", speciesId: "rune_archon", phases: [
    { name: "phase1", hpAtMostPercent: null, ai: "controller", attackIds: ["rune_lance", "stun_blast"] },
    { name: "phase2", hpAtMostPercent: 50, ai: "skirmisher", attackIds: ["rune_lance", "stun_blast", "arcane_pulse", "lightning_dash"] },
  ] },
  { id: "dream_eater", speciesId: "dream_eater", phases: [
    { name: "phase1", hpAtMostPercent: null, ai: "ambusher", attackIds: ["dream_bite", "fear_touch"] },
    { name: "phase2", hpAtMostPercent: 60, ai: "controller", attackIds: ["dream_bite", "fear_touch", "psychic_wave", "possession_touch"] },
  ] },
  { id: "black_orbit", speciesId: "black_orbit", phases: [
    { name: "phase1", hpAtMostPercent: null, ai: "sniper", attackIds: ["star_lance", "machine_bolt"] },
    { name: "phase2", hpAtMostPercent: 50, ai: "controller", attackIds: ["star_lance", "machine_bolt", "gravity_pulse", "lightning_dash"] },
  ] },
  { id: "abyssal_sentinel", speciesId: "abyssal_sentinel", phases: [
    { name: "phase1", hpAtMostPercent: null, ai: "controller", attackIds: ["void_bolt", "anchor_target"] },
    { name: "phase2", hpAtMostPercent: 50, ai: "dimensional_hunter", attackIds: ["void_bolt", "anchor_target", "abyssal_pulse", "soul_drain"] },
  ] },
  { id: "olympian_final", speciesId: "olympian_final", phases: [
    { name: "Authority", hpAtMostPercent: null, ai: "controller", attackIds: ["divine_lance", "divine_command", "judgement"] },
    { name: "Motion", hpAtMostPercent: 70, ai: "skirmisher", attackIds: ["divine_lance", "divine_command", "judgement", "reality_cut", "lightning_dash"] },
    { name: "Unmaking", hpAtMostPercent: 35, ai: "controller", attackIds: ["divine_lance", "divine_command", "judgement", "reality_cut", "lightning_dash", "celestial_burst", "annihilation"] },
  ] },
];
