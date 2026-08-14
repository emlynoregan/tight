import type { AttackChannelId, AttributeId, DamageTypeId, TargetingShapeId } from "../model/ids";
import type { AttackDefinition } from "../model/content-types";

function attack(
  id: string,
  name: string,
  attributes: readonly AttributeId[],
  channel: AttackChannelId,
  accuracy: number,
  power: number,
  range: number,
  shape: TargetingShapeId,
  defence: AttributeId,
  damageType: DamageTypeId | null,
  requiresLos: boolean,
  cooldown: number,
  extra?: { tags?: readonly string[]; onHitStatusId?: string },
): AttackDefinition {
  const tags = [...(extra?.tags ?? [])];
  if (shape === "adjacent") {
    tags.push("melee");
  }
  if (range > 1 || shape === "single" || shape === "line") {
    if (shape !== "adjacent") {
      tags.push("ranged");
    }
  }
  if (shape === "radius1" || shape === "radius2" || shape === "cross1" || shape === "line") {
    tags.push("area");
  }
  return {
    id,
    name,
    attributes,
    channel,
    accuracy,
    power,
    range,
    shape,
    defence,
    damageType,
    requiresLos,
    cooldown,
    tags: [...new Set(tags)],
    onHitStatusId: extra?.onHitStatusId ?? null,
  };
}

export const ATTACKS: readonly AttackDefinition[] = [
  attack("unarmed_strike", "Unarmed Strike", ["str"], "physical", 0, 1, 1, "adjacent", "con", "physical", false, 0, { tags: ["weapon"] }),
  attack("club_swing", "Club Swing", ["str"], "physical", 0, 3, 1, "adjacent", "con", "physical", false, 0, { tags: ["weapon"] }),
  attack("sword_slash", "Sword Slash", ["str"], "physical", 1, 4, 1, "adjacent", "con", "physical", false, 0, { tags: ["weapon"] }),
  attack("axe_hew", "Axe Hew", ["str"], "physical", -1, 6, 1, "adjacent", "con", "physical", false, 0, { tags: ["weapon"] }),
  attack("hammer_blow", "Hammer Blow", ["str"], "physical", -1, 5, 1, "adjacent", "con", "physical", false, 0, { tags: ["weapon"] }),
  attack("spear_thrust", "Spear Thrust", ["str", "dex"], "finesse", 0, 4, 2, "single", "dex", "piercing", true, 0, { tags: ["weapon"] }),
  attack("dagger_stab", "Dagger Stab", ["dex"], "finesse", 2, 3, 1, "adjacent", "dex", "piercing", false, 0, { tags: ["weapon"] }),
  attack("bow_shot", "Bow Shot", ["dex"], "finesse", 0, 4, 6, "single", "dex", "piercing", true, 0, { tags: ["weapon", "ranged"] }),
  attack("heavy_bow_shot", "Heavy Bow Shot", ["dex"], "finesse", -1, 6, 7, "single", "dex", "piercing", true, 1, { tags: ["weapon", "ranged"] }),
  attack("shield_bash", "Shield Bash", ["con"], "endurance", 0, 2, 1, "adjacent", "con", "physical", false, 1, { tags: ["weapon", "status_delivery"], onHitStatusId: "stunned" }),
  attack("quick_cut", "Quick Cut", ["spd", "dex"], "speed", 1, 3, 1, "adjacent", "spd", "physical", false, 0),
  attack("lunge", "Lunge", ["spd", "str"], "speed", 0, 4, 2, "single", "spd", "physical", true, 1),
  attack("lightning_dash", "Lightning Dash", ["spd", "int"], "speed", 0, 5, 4, "single", "spd", "arcane", true, 2, { tags: ["spell"] }),
  attack("momentum_strike", "Momentum Strike", ["spd", "con"], "speed", 0, 4, 1, "adjacent", "con", "physical", false, 1),
  attack("bite", "Bite", ["str"], "endurance", 0, 3, 1, "adjacent", "con", "physical", false, 0, { tags: ["innate", "monster"] }),
  attack("venom_bite", "Venom Bite", ["con"], "endurance", 0, 2, 1, "adjacent", "con", "poison", false, 1, { tags: ["innate", "monster", "status_delivery"], onHitStatusId: "poisoned" }),
  attack("poison_spit", "Poison Spit", ["con"], "endurance", 0, 2, 4, "single", "dex", "poison", true, 1, { tags: ["monster", "status_delivery"], onHitStatusId: "poisoned" }),
  attack("body_slam", "Body Slam", ["con", "str"], "endurance", -1, 5, 1, "adjacent", "con", "physical", false, 1, { tags: ["monster"] }),
  attack("acid_spray", "Acid Spray", ["con"], "endurance", -1, 3, 3, "line", "dex", "poison", true, 2, { tags: ["monster", "status_delivery"], onHitStatusId: "poisoned" }),
  attack("arcane_bolt", "Arcane Bolt", ["int"], "arcane", 1, 4, 6, "single", "int", "arcane", true, 0, { tags: ["spell"] }),
  attack("fire_bolt", "Fire Bolt", ["int"], "arcane", 0, 4, 5, "single", "dex", "fire", true, 0, { tags: ["spell"] }),
  attack("fire_burst", "Fire Burst", ["int"], "arcane", -1, 4, 4, "radius1", "dex", "fire", true, 2, { tags: ["spell"] }),
  attack("frost_bolt", "Frost Bolt", ["int"], "arcane", 0, 3, 5, "single", "dex", "cold", true, 1, { tags: ["spell"] }),
  attack("rune_lance", "Rune Lance", ["int", "dex"], "arcane", 1, 5, 7, "line", "dex", "arcane", true, 2, { tags: ["spell"] }),
  attack("arcane_pulse", "Arcane Pulse", ["int", "psy"], "arcane", 0, 3, 0, "radius1", "int", "arcane", false, 2, { tags: ["spell"] }),
  attack("smite", "Smite", ["wis"], "divine", 0, 5, 4, "single", "wis", "divine", true, 1, { tags: ["spell"] }),
  attack("exorcism", "Exorcism", ["wis", "psy"], "divine", 1, 5, 5, "single", "psy", "divine", true, 1, { tags: ["spell"] }),
  attack("holy_strike", "Holy Strike", ["wis", "str"], "divine", 0, 5, 1, "adjacent", "con", "divine", false, 0, { tags: ["weapon"] }),
  attack("radiant_cross", "Radiant Cross", ["wis"], "divine", -1, 4, 0, "cross1", "wis", "divine", false, 2, { tags: ["spell"] }),
  attack("judgement", "Judgement", ["wis", "cha"], "divine", -1, 7, 6, "single", "wis", "divine", true, 3, { tags: ["spell", "boss"] }),
  attack("command", "Command", ["cha"], "social", 0, 0, 5, "single", "wis", null, true, 2, { tags: ["status_delivery"] }),
  attack("terrifying_shout", "Terrifying Shout", ["cha", "psy"], "social", 0, 0, 0, "radius2", "wis", null, false, 3, { tags: ["status_delivery"] }),
  attack("mocking_jab", "Mocking Jab", ["cha", "dex"], "social", 1, 2, 3, "single", "wis", "physical", true, 1, { tags: ["status_delivery"] }),
  attack("divine_command", "Divine Command", ["cha", "wis"], "social", 1, 0, 6, "single", "wis", null, true, 2, { tags: ["status_delivery"] }),
  attack("mind_spike", "Mind Spike", ["psy"], "psychic", 1, 4, 6, "single", "psy", "psychic", true, 0, { tags: ["spell"] }),
  attack("fear_touch", "Fear Touch", ["psy"], "psychic", 0, 2, 1, "adjacent", "wis", "psychic", false, 1, { tags: ["status_delivery"] }),
  attack("psychic_wave", "Psychic Wave", ["psy"], "psychic", -1, 3, 0, "radius2", "psy", "psychic", false, 2),
  attack("dream_bite", "Dream Bite", ["psy", "con"], "psychic", 0, 4, 1, "adjacent", "psy", "psychic", false, 1, { tags: ["monster"] }),
  attack("possession_touch", "Possession Touch", ["psy", "cha"], "psychic", -1, 0, 1, "adjacent", "psy", null, false, 3, { tags: ["status_delivery"] }),
  attack("void_whisper", "Void Whisper", ["psy", "wis"], "psychic", 0, 4, 5, "single", "psy", "void", true, 2),
  attack("spectral_claw", "Spectral Claw", ["psy"], "psychic", 0, 4, 1, "adjacent", "psy", "ethereal", false, 0, { tags: ["monster"] }),
  attack("soul_drain", "Soul Drain", ["psy", "con"], "psychic", -1, 5, 3, "single", "psy", "ethereal", true, 2, { tags: ["monster"] }),
  attack("void_touch", "Void Touch", ["psy", "con"], "endurance", 0, 5, 1, "adjacent", "con", "void", false, 1, { tags: ["monster"] }),
  attack("void_bolt", "Void Bolt", ["psy", "int"], "psychic", 0, 5, 6, "single", "psy", "void", true, 1, { tags: ["monster"] }),
  attack("abyssal_pulse", "Abyssal Pulse", ["psy", "con"], "psychic", -1, 5, 0, "radius1", "psy", "void", false, 3, { tags: ["monster", "boss"] }),
  attack("star_lance", "Star Lance", ["spd", "int"], "speed", 0, 6, 7, "line", "spd", "arcane", true, 2, { tags: ["weapon"] }),
  attack("gravity_hammer", "Gravity Hammer", ["str", "int"], "arcane", -1, 7, 1, "adjacent", "con", "physical", false, 2, { tags: ["weapon", "forced_movement"] }),
  attack("machine_bolt", "Machine Bolt", ["int", "dex"], "finesse", 1, 4, 6, "single", "dex", "piercing", true, 0, { tags: ["monster"] }),
  attack("gravity_pulse", "Gravity Pulse", ["int", "con"], "arcane", 0, 2, 4, "radius1", "con", "environmental", true, 2, { tags: ["forced_movement"] }),
  attack("divine_lance", "Divine Lance", ["wis", "int"], "divine", 1, 7, 8, "line", "wis", "divine", true, 2, { tags: ["boss"] }),
  attack("reality_cut", "Reality Cut", ["psy", "dex"], "psychic", 0, 7, 5, "single", "psy", "ethereal", true, 2, { tags: ["weapon", "boss"] }),
  attack("celestial_burst", "Celestial Burst", ["wis", "cha"], "divine", -1, 6, 0, "radius2", "wis", "divine", false, 3, { tags: ["boss"] }),
  attack("annihilation", "Annihilation", ["psy", "int"], "psychic", -2, 9, 6, "single", "psy", "void", true, 4, { tags: ["boss"] }),
  attack("stun_blast", "Stun Blast", ["int"], "arcane", 0, 0, 4, "single", "con", null, true, 2, { tags: ["status_delivery", "spell"], onHitStatusId: "stunned" }),
  attack("chill_ray", "Chill Ray", ["int"], "arcane", 1, 0, 5, "single", "con", null, true, 1, { tags: ["status_delivery", "spell"], onHitStatusId: "chilled" }),
  attack("silence", "Silence", ["wis", "int"], "divine", 0, 0, 5, "single", "wis", null, true, 2, { tags: ["status_delivery", "spell"], onHitStatusId: "silenced" }),
  attack("anchor_target", "Anchor", ["wis", "psy"], "divine", 0, 0, 5, "single", "psy", null, true, 2, { tags: ["status_delivery", "transition_related"], onHitStatusId: "anchored" }),
  attack("blind_target", "Blind", ["dex", "int"], "finesse", 0, 0, 4, "single", "dex", null, true, 2, { tags: ["status_delivery"], onHitStatusId: "blinded" }),
  attack("confuse", "Confuse", ["psy"], "psychic", 0, 0, 5, "single", "psy", null, true, 2, { tags: ["status_delivery"], onHitStatusId: "confused" }),
];

export const ATTACK_TAGS = [
  "melee",
  "ranged",
  "area",
  "weapon",
  "spell",
  "innate",
  "monster",
  "boss",
  "forced_movement",
  "status_delivery",
  "transition_related",
  "environmental",
] as const;
