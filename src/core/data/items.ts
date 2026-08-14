import type { AttributeId, DamageTypeId, EquipmentSlotId, RarityId, ResistanceStateId } from "../model/ids";
import type { ItemCombatMods, ItemDefinition } from "../model/content-types";

const EMPTY_COMBAT: ItemCombatMods = {
  armourPhysical: 0,
  armourPiercing: 0,
  attributeMods: {},
  resistanceMods: [],
  initiativeModifier: 0,
  protectionTags: [],
};

function combat(
  partial: Partial<ItemCombatMods> & {
    attr?: Partial<Record<AttributeId, number>>;
    resist?: readonly { damageType: DamageTypeId; state: ResistanceStateId }[];
  },
): ItemCombatMods {
  return {
    armourPhysical: partial.armourPhysical ?? 0,
    armourPiercing: partial.armourPiercing ?? 0,
    attributeMods: partial.attr ?? partial.attributeMods ?? {},
    resistanceMods: partial.resist ?? partial.resistanceMods ?? [],
    initiativeModifier: partial.initiativeModifier ?? 0,
    protectionTags: partial.protectionTags ?? [],
  };
}

function item(
  id: string,
  name: string,
  kind: ItemDefinition["kind"],
  rarity: RarityId,
  slot: EquipmentSlotId | null,
  value: number,
  extras?: Partial<Omit<ItemDefinition, "combat">> & { combat?: ItemCombatMods },
): ItemDefinition {
  return {
    id,
    name,
    kind,
    rarity,
    slot,
    attackIds: extras?.attackIds ?? [],
    grantedAbilityIds: extras?.grantedAbilityIds ?? [],
    value,
    stackSize: extras?.stackSize ?? 1,
    tags: extras?.tags ?? [],
    useAbilityId: extras?.useAbilityId ?? null,
    combat: extras?.combat ?? EMPTY_COMBAT,
  };
}

export const ITEMS: readonly ItemDefinition[] = [
  item("club", "Club", "weapon", "common", "weapon", 8, { attackIds: ["club_swing"], tags: ["field", "wild"] }),
  item("sword", "Sword", "weapon", "common", "weapon", 15, { attackIds: ["sword_slash"], tags: ["mundane"] }),
  item("great_axe", "Great Axe", "weapon", "uncommon", "weapon", 28, { attackIds: ["axe_hew"], grantedAbilityIds: ["heavy_strike"], tags: ["dungeon", "heavy"] }),
  item("dagger", "Dagger", "weapon", "common", "weapon", 12, { attackIds: ["dagger_stab"], tags: ["inside", "finesse"] }),
  item("bow", "Bow", "weapon", "common", "weapon", 20, { attackIds: ["bow_shot"], grantedAbilityIds: ["aimed_shot"], tags: ["wild", "finesse"] }),
  item("spear", "Spear", "weapon", "uncommon", "weapon", 22, { attackIds: ["spear_thrust"], tags: ["field", "dungeon"] }),
  item("phase_knife", "Phase Knife", "weapon", "rare", "weapon", 70, { attackIds: ["reality_cut"], tags: ["ethereal", "psychic"] }),
  item("spell_lattice", "Spell Lattice", "weapon", "rare", "weapon", 80, { attackIds: ["arcane_bolt"], grantedAbilityIds: ["firebolt", "force_push"], tags: ["arcane"] }),
  item("soul_bell", "Soul Bell", "weapon", "rare", "weapon", 80, { attackIds: ["holy_strike"], grantedAbilityIds: ["exorcism_ability"], tags: ["ethereal", "divine"] }),
  item("gravity_hammer", "Gravity Hammer", "weapon", "rare", "weapon", 95, { attackIds: ["gravity_hammer"], grantedAbilityIds: ["gravity_push"], tags: ["space", "arcane"] }),
  item("star_lance", "Star Lance", "weapon", "rare", "weapon", 100, { attackIds: ["star_lance"], grantedAbilityIds: ["lightning_step"], tags: ["space", "speed"] }),
  item("olympian_blade", "Olympian Blade", "weapon", "unique", "weapon", 120, { attackIds: ["holy_strike"], grantedAbilityIds: ["smite_ability"], tags: ["olympus", "divine"] }),
  item("wooden_shield", "Wooden Shield", "offhand", "common", "offhand", 12, {
    grantedAbilityIds: ["shield_bash_ability"],
    combat: combat({ armourPhysical: 1, attr: { spd: -1 } }),
  }),
  item("buckler", "Buckler", "offhand", "uncommon", "offhand", 25, {
    grantedAbilityIds: ["shield_bash_ability"],
    combat: combat({ armourPhysical: 1 }),
  }),
  item("warding_tome", "Warding Tome", "offhand", "uncommon", "offhand", 35, {
    grantedAbilityIds: ["arcane_ward"],
    combat: combat({ resist: [{ damageType: "arcane", state: "resistant" }] }),
  }),
  item("spirit_mirror", "Spirit Mirror", "offhand", "rare", "offhand", 65, {
    grantedAbilityIds: ["psychic_ward"],
    combat: combat({ resist: [{ damageType: "psychic", state: "resistant" }] }),
  }),
  item("traveller_clothes", "Traveller Clothes", "body", "common", "body", 3, { tags: ["mundane"] }),
  item("leather_armour", "Leather Armour", "body", "common", "body", 18, {
    tags: ["field", "wild"],
    combat: combat({ armourPhysical: 1 }),
  }),
  item("plate_armour", "Plate Armour", "body", "uncommon", "body", 40, {
    tags: ["dungeon"],
    combat: combat({ armourPhysical: 2, attr: { spd: -2 } }),
  }),
  item("arcane_robes", "Arcane Robes", "body", "uncommon", "body", 45, {
    tags: ["arcane"],
    combat: combat({ resist: [{ damageType: "arcane", state: "resistant" }] }),
  }),
  item("ghost_veil", "Ghost Veil", "body", "rare", "body", 70, {
    tags: ["ethereal", "etherealProtected"],
    combat: combat({
      resist: [{ damageType: "ethereal", state: "resistant" }],
      protectionTags: ["etherealProtected"],
    }),
  }),
  item("vacuum_suit", "Vacuum Suit", "body", "uncommon", "body", 55, {
    tags: ["space", "vacuumProtected"],
    combat: combat({
      resist: [{ damageType: "cold", state: "resistant" }],
      protectionTags: ["vacuumProtected"],
    }),
  }),
  item("void_skin", "Void Skin", "body", "rare", "body", 90, {
    tags: ["void", "voidProtected"],
    combat: combat({
      resist: [
        { damageType: "void", state: "resistant" },
        { damageType: "psychic", state: "resistant" },
      ],
      protectionTags: ["voidProtected"],
    }),
  }),
  item("divine_mantle", "Divine Mantle", "body", "rare", "body", 110, {
    tags: ["olympus", "divineProtected"],
    combat: combat({
      resist: [
        { damageType: "divine", state: "resistant" },
        { damageType: "void", state: "resistant" },
      ],
      protectionTags: ["divineProtected"],
    }),
  }),
  item("miner_helmet", "Miner Helmet", "head", "common", "head", 15),
  item("seer_hood", "Seer Hood", "head", "uncommon", "head", 35, { combat: combat({ attr: { wis: 1 } }) }),
  item("mind_cage", "Mind Cage", "head", "rare", "head", 60, {
    combat: combat({ attr: { cha: -1 }, resist: [{ damageType: "psychic", state: "resistant" }] }),
  }),
  item("command_crown", "Command Crown", "head", "rare", "head", 80, {
    grantedAbilityIds: ["command_ability"],
    combat: combat({ attr: { cha: 2 } }),
  }),
  item("star_helm", "Star Helm", "head", "rare", "head", 75, {
    tags: ["vacuumProtected"],
    combat: combat({ attr: { int: 1 }, protectionTags: ["vacuumProtected"] }),
  }),
  item("lucky_stone", "Lucky Stone", "charm", "uncommon", "charm", 30, { combat: combat({ initiativeModifier: 1 }) }),
  item("hunter_eye", "Hunter Eye", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { dex: 1 } }) }),
  item("iron_heart", "Iron Heart", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { con: 1 } }) }),
  item("saint_mark", "Saint Mark", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { wis: 1 } }) }),
  item("dream_thread", "Dream Thread", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { psy: 1 } }) }),
  item("silver_tongue", "Silver Tongue", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { cha: 1 } }) }),
  item("spark_knot", "Spark Knot", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { int: 1 } }) }),
  item("runner_token", "Runner Token", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { spd: 1 } }) }),
  item("ox_tooth", "Ox Tooth", "charm", "uncommon", "charm", 30, { combat: combat({ attr: { str: 1 } }) }),
  item("anchor_artefact", "Anchor", "artefact", "rare", "artefact", 100),
  item("echo", "Echo", "artefact", "rare", "artefact", 100, { grantedAbilityIds: ["echo_return"] }),
  item("phase_key", "Phase Key", "artefact", "rare", "artefact", 90),
  item("still_stone", "Still Stone", "artefact", "uncommon", "artefact", 60, { grantedAbilityIds: ["still_stone"] }),
  item("lantern_of_nothing", "Lantern of Nothing", "artefact", "rare", "artefact", 100),
  item("second_hand", "Second Hand", "artefact", "unique", "artefact", 0, { grantedAbilityIds: ["second_hand"] }),
  item("healing_herb", "Healing Herb", "consumable", "common", null, 5, { stackSize: 9, useAbilityId: "use_healing_herb", tags: ["field", "wild"] }),
  item("greater_healing_potion", "Greater Healing Potion", "consumable", "uncommon", null, 18, { stackSize: 9, useAbilityId: "use_greater_heal", tags: ["arcane", "shop"] }),
  item("antidote", "Antidote", "consumable", "common", null, 6, { stackSize: 9, useAbilityId: "use_antidote", tags: ["mundane"] }),
  item("cooling_salve", "Cooling Salve", "consumable", "common", null, 6, { stackSize: 9, useAbilityId: "use_cooling_salve", tags: ["mundane"] }),
  item("stimulant", "Stimulant", "consumable", "uncommon", null, 14, { stackSize: 9, useAbilityId: "use_stimulant", tags: ["inside", "space"] }),
  item("light_orb", "Light Orb", "consumable", "uncommon", null, 14, { stackSize: 9, useAbilityId: "use_light_orb", tags: ["void", "arcane"] }),
  item("dimensional_stabiliser", "Dimensional Stabiliser", "consumable", "rare", null, 30, { stackSize: 9, useAbilityId: "use_stabiliser", tags: ["dimensional"] }),
  item("herb", "Herb", "resource", "common", null, 2, { stackSize: 9, tags: ["resource"] }),
  item("ore", "Ore", "resource", "common", null, 4, { stackSize: 9, tags: ["resource"] }),
  item("crystal", "Arcane Crystal", "resource", "uncommon", null, 7, { stackSize: 9, tags: ["resource"] }),
  item("ectoplasm", "Ectoplasm", "resource", "uncommon", null, 8, { stackSize: 9, tags: ["resource"] }),
  item("star_matter", "Star Matter", "resource", "rare", null, 10, { stackSize: 9, tags: ["resource"] }),
  item("void_fragment", "Void Fragment", "resource", "rare", null, 15, { stackSize: 9, tags: ["resource"] }),
  item("divine_fragment", "Divine Fragment", "resource", "rare", null, 20, { stackSize: 9, tags: ["resource"] }),
  item("house_key", "House Key", "key", "unique", null, 0),
  item("mine_key", "Mine Key", "key", "unique", null, 0),
  item("rune_sigil", "Rune Sigil", "key", "unique", null, 0),
  item("spirit_token", "Spirit Token", "key", "unique", null, 0),
  item("station_clearance", "Station Clearance", "key", "unique", null, 0),
  item("abyss_mark", "Abyss Mark", "key", "unique", null, 0),
  item("coin", "Coin", "currency", "common", null, 1, { stackSize: 0 }),
];

export const STARTING_LOADOUT = {
  equippedWeapon: "sword",
  equippedBody: "traveller_clothes",
  inventory: [{ itemId: "healing_herb", quantity: 2 }],
  coin: 0,
} as const;

export const STAPLE_SHOP_GOODS = [
  "healing_herb",
  "antidote",
  "cooling_salve",
  "club",
  "sword",
  "dagger",
  "traveller_clothes",
  "leather_armour",
] as const;
