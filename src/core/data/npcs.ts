import type {
  AbilityAcquisition,
  NpcArchetype,
  QuestDefinition,
  QuestRewards,
  ShopInstanceDefinition,
  ShopType,
  StoryNpc,
} from "../model/content-types";

export const NPC_ARCHETYPES: readonly NpcArchetype[] = [
  { id: "villager", roles: ["villager"], dimensionMin: 0, dimensionMax: 3, behaviour: "stationary" },
  { id: "shopkeeper", roles: ["merchant"], dimensionMin: 0, dimensionMax: 5, behaviour: "stationary" },
  { id: "guard_npc", roles: ["guard"], dimensionMin: 0, dimensionMax: 5, behaviour: "stationary" },
  { id: "scholar", roles: ["scholar"], dimensionMin: 2, dimensionMax: 7, behaviour: "stationary" },
  { id: "miner", roles: ["villager", "traveller"], dimensionMin: 4, dimensionMax: 5, behaviour: "stationary" },
  { id: "mage_npc", roles: ["mystic", "scholar"], dimensionMin: 6, dimensionMax: 7, behaviour: "stationary" },
  { id: "medium", roles: ["mystic", "dimensional-expert"], dimensionMin: 8, dimensionMax: 9, behaviour: "stationary" },
  { id: "spacer", roles: ["traveller", "merchant"], dimensionMin: 10, dimensionMax: 11, behaviour: "stationary" },
  { id: "void_broker", roles: ["merchant", "mystic"], dimensionMin: 12, dimensionMax: 13, behaviour: "stationary" },
  { id: "pilgrim", roles: ["traveller"], dimensionMin: 14, dimensionMax: 14, behaviour: "stationary" },
  { id: "divine_guide", roles: ["divine", "dimensional-expert"], dimensionMin: 14, dimensionMax: 15, behaviour: "stationary" },
];

export const STORY_NPCS: readonly StoryNpc[] = [
  { id: "mara_guide", name: "Mara", archetypeId: "scholar", roleSummary: "explains early dimensional-route concepts" },
  { id: "torren_miner", name: "Torren", archetypeId: "miner", roleSummary: "Stone/Ruin route clue and guardian content" },
  { id: "vesa_mage", name: "Vesa", archetypeId: "mage_npc", roleSummary: "teaches deliberate magical transition content" },
  { id: "enid_medium", name: "Enid", archetypeId: "medium", roleSummary: "teaches Spirit/Dream travel and warns about pursuit" },
  { id: "orik_spacer", name: "Orik", archetypeId: "spacer", roleSummary: "Space survival/travel guidance" },
  { id: "nox_broker", name: "Nox", archetypeId: "void_broker", roleSummary: "Void equipment and ascent clues" },
  { id: "aelia_guide", name: "Aelia", archetypeId: "divine_guide", roleSummary: "Olympus/final-boss warning" },
];

export const NAME_POOLS = {
  mundane_names: ["Ada", "Bram", "Cora", "Dain", "Eda", "Finn", "Gwen", "Hale", "Iris", "Jory", "Kira", "Leon"],
  arcane_names: ["Aven", "Cyr", "Elian", "Ione", "Mera", "Oryn", "Sera", "Thale"],
  spirit_names: ["Ash", "Echo", "Lumen", "Mora", "Pale", "Rue", "Vale", "Wren"],
  space_names: ["Ari", "Cass", "Juno", "Kepler", "Nova", "Rhea", "Sol", "Vega"],
  void_names: ["Nox", "Vey", "Umbra", "Riven", "Hollow", "Sable"],
  divine_names: ["Aelia", "Cael", "Ilyon", "Seraph", "Theon", "Vesta"],
} as const;

function shopType(
  id: string,
  stapleItemIds: readonly string[],
  limitedPoolItemIds: readonly string[],
): ShopType {
  return { id, stapleItemIds, limitedPoolItemIds, limitedPickCount: 2, maxRareExtras: 1 };
}

export const SHOP_TYPES: readonly ShopType[] = [
  shopType("general_store", ["healing_herb", "antidote"], ["club", "sword", "dagger", "traveller_clothes", "leather_armour"]),
  shopType("dungeon_supplier", ["healing_herb", "antidote", "cooling_salve"], ["miner_helmet", "plate_armour", "greater_healing_potion"]),
  shopType("arcane_dealer", ["greater_healing_potion"], ["spell_lattice", "arcane_robes", "dimensional_stabiliser", "warding_tome"]),
  shopType("spirit_medium_shop", ["healing_herb"], ["ghost_veil", "spirit_mirror", "soul_bell"]),
  shopType("space_trader", ["greater_healing_potion"], ["vacuum_suit", "star_helm", "still_stone"]),
  shopType("void_broker_shop", ["light_orb"], ["void_skin", "lantern_of_nothing", "dimensional_stabiliser"]),
  shopType("divine_vendor", ["greater_healing_potion"], ["divine_mantle"]),
];

export const SHOP_INSTANCES: readonly ShopInstanceDefinition[] = [
  { id: "shop_start", shopTypeId: "general_store", npcId: null, anchorNpcId: null, onStartingPlane: true, specialStock: [] },
  { id: "shop_torren", shopTypeId: "dungeon_supplier", npcId: null, anchorNpcId: "torren_miner", onStartingPlane: false, specialStock: [{ itemId: "miner_helmet", priceOverride: null }] },
  { id: "shop_vesa", shopTypeId: "arcane_dealer", npcId: "vesa_mage", anchorNpcId: "vesa_mage", onStartingPlane: false, specialStock: [{ itemId: "spell_lattice", priceOverride: null }] },
  { id: "shop_enid", shopTypeId: "spirit_medium_shop", npcId: "enid_medium", anchorNpcId: "enid_medium", onStartingPlane: false, specialStock: [{ itemId: "soul_bell", priceOverride: null }] },
  { id: "shop_orik", shopTypeId: "space_trader", npcId: "orik_spacer", anchorNpcId: "orik_spacer", onStartingPlane: false, specialStock: [{ itemId: "still_stone", priceOverride: null }] },
  { id: "shop_nox", shopTypeId: "void_broker_shop", npcId: "nox_broker", anchorNpcId: "nox_broker", onStartingPlane: false, specialStock: [{ itemId: "lantern_of_nothing", priceOverride: null }] },
  { id: "shop_aelia", shopTypeId: "divine_vendor", npcId: null, anchorNpcId: "aelia_guide", onStartingPlane: false, specialStock: [{ itemId: "olympian_blade", priceOverride: 120 }] },
];

export const WORLD_FLAGS = [
  "met_mara",
  "stone_route_revealed",
  "stone_guardian_dead",
  "arcane_route_open",
  "spirit_route_open",
  "space_route_open",
  "void_route_open",
  "divine_route_open",
  "olympus_route_known",
  "final_boss_dead",
  "victory",
] as const;

function rewards(
  flagIds: readonly string[],
  learnAbilityIds: readonly string[] = [],
  extras: Partial<QuestRewards> = {},
): QuestRewards {
  return {
    flagIds,
    learnAbilityIds,
    apEventId: extras.apEventId ?? null,
    bindsGeneratedGuardianGate: extras.bindsGeneratedGuardianGate ?? false,
    ...(extras.coinMin !== undefined ? { coinMin: extras.coinMin } : {}),
    ...(extras.coinMax !== undefined ? { coinMax: extras.coinMax } : {}),
  };
}

export const QUESTS: readonly QuestDefinition[] = [
  {
    id: "q_first_crack",
    name: "The First Crack",
    giver: "mara_guide",
    major: false,
    usableAsProgressionGate: false,
    objectives: [{ type: "speak_to_giver" }, { type: "reach_dimension", dimension: 4 }],
    rewards: rewards(["stone_route_revealed"]),
  },
  {
    id: "q_stone_warden",
    name: "The Warden Below",
    giver: "torren_miner",
    major: true,
    usableAsProgressionGate: true,
    objectives: [{ type: "defeat_encounter", encounterId: "guardian_stone" }],
    rewards: rewards(["stone_guardian_dead"], [], { apEventId: "ap_guardian_defeat", bindsGeneratedGuardianGate: true }),
  },
  {
    id: "q_arcane_gate",
    name: "A Door Made of Spell",
    giver: "vesa_mage",
    major: true,
    usableAsProgressionGate: true,
    objectives: [{ type: "speak_to_giver" }],
    rewards: rewards(["arcane_route_open"], ["arcane_gate"]),
  },
  {
    id: "q_spirit_path",
    name: "The Road That Follows",
    giver: "enid_medium",
    major: true,
    usableAsProgressionGate: true,
    objectives: [{ type: "defeat_encounter", encounterId: "guardian_spirit" }],
    rewards: rewards(["spirit_route_open"], ["dream_step"], { apEventId: "ap_guardian_defeat", bindsGeneratedGuardianGate: true }),
  },
  {
    id: "q_star_road",
    name: "Across the Black",
    giver: "orik_spacer",
    major: true,
    usableAsProgressionGate: true,
    objectives: [{ type: "defeat_encounter", encounterId: "guardian_space" }],
    rewards: rewards(["space_route_open", "void_route_open"], [], { apEventId: "ap_guardian_defeat", bindsGeneratedGuardianGate: true }),
  },
  {
    id: "q_abyss_gate",
    name: "The Last Dark Door",
    giver: "nox_broker",
    major: true,
    usableAsProgressionGate: true,
    objectives: [{ type: "defeat_encounter", encounterId: "guardian_void" }],
    rewards: rewards(["divine_route_open"], ["void_slip"], { apEventId: "ap_guardian_defeat", bindsGeneratedGuardianGate: true }),
  },
  {
    id: "q_olympus",
    name: "Olympus",
    giver: "aelia_guide",
    major: true,
    usableAsProgressionGate: false,
    objectives: [{ type: "defeat_encounter", encounterId: "boss_olympus" }],
    rewards: rewards(["final_boss_dead", "victory"]),
  },
  {
    id: "oq_lost_cache",
    name: "Lost Cache",
    giver: null,
    major: false,
    usableAsProgressionGate: false,
    objectives: [{ type: "recover_and_return" }],
    rewards: rewards([], [], { coinMin: 8, coinMax: 15 }),
  },
  {
    id: "oq_stranded_traveller",
    name: "Stranded Traveller",
    giver: null,
    major: false,
    usableAsProgressionGate: false,
    objectives: [{ type: "activate_or_deliver" }],
    rewards: rewards([]),
  },
  {
    id: "oq_resource_trade",
    name: "Resource Trade",
    giver: null,
    major: false,
    usableAsProgressionGate: false,
    objectives: [{ type: "deliver_resources", countMin: 1, countMax: 3 }],
    rewards: rewards([]),
  },
];

export const ABILITY_ACQUISITIONS: readonly AbilityAcquisition[] = [
  { abilityId: "arcane_gate", questId: "q_arcane_gate", giverNpcId: "vesa_mage", prerequisiteEncounterId: null, fixedRewardId: "reward_arcane_gate" },
  { abilityId: "dream_step", questId: "q_spirit_path", giverNpcId: "enid_medium", prerequisiteEncounterId: "guardian_spirit", fixedRewardId: "reward_dream_step" },
  { abilityId: "void_slip", questId: "q_abyss_gate", giverNpcId: "nox_broker", prerequisiteEncounterId: "guardian_void", fixedRewardId: "reward_void_slip" },
  { abilityId: "divine_passage", questId: null, giverNpcId: "aelia_guide", prerequisiteEncounterId: null, fixedRewardId: "reward_divine_passage" },
];

export const DIALOGUE_ROOTS = [
  "dlg_mara_intro",
  "dlg_torren_guardian",
  "dlg_vesa_gate",
  "dlg_enid_pursuit",
  "dlg_orik_space",
  "dlg_nox_void",
  "dlg_aelia_olympus",
] as const;
