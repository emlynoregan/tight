import type { NpcArchetype, QuestDefinition, ShopType, StoryNpc } from "../model/content-types";

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

export const SHOP_TYPES: readonly ShopType[] = [
  { id: "general_store", stapleItemIds: ["healing_herb", "antidote"], limitedPoolItemIds: ["club", "sword", "dagger", "traveller_clothes", "leather_armour"] },
  { id: "dungeon_supplier", stapleItemIds: ["healing_herb", "antidote", "cooling_salve"], limitedPoolItemIds: ["miner_helmet", "plate_armour", "greater_healing_potion"] },
  { id: "arcane_dealer", stapleItemIds: ["greater_healing_potion"], limitedPoolItemIds: ["spell_lattice", "arcane_robes", "dimensional_stabiliser", "warding_tome"] },
  { id: "spirit_medium_shop", stapleItemIds: ["healing_herb"], limitedPoolItemIds: ["ghost_veil", "spirit_mirror", "soul_bell"] },
  { id: "space_trader", stapleItemIds: ["greater_healing_potion"], limitedPoolItemIds: ["vacuum_suit", "star_helm", "still_stone"] },
  { id: "void_broker_shop", stapleItemIds: ["light_orb"], limitedPoolItemIds: ["void_skin", "lantern_of_nothing", "dimensional_stabiliser"] },
  { id: "divine_vendor", stapleItemIds: ["greater_healing_potion"], limitedPoolItemIds: ["divine_mantle"] },
];

export const SHOP_INSTANCES = [
  { id: "shop_start", shopTypeId: "general_store", npcId: null, specialStock: [] as const },
  { id: "shop_torren", shopTypeId: "dungeon_supplier", npcId: null, specialStock: ["miner_helmet"] },
  { id: "shop_vesa", shopTypeId: "arcane_dealer", npcId: "vesa_mage", specialStock: ["spell_lattice"] },
  { id: "shop_enid", shopTypeId: "spirit_medium_shop", npcId: "enid_medium", specialStock: ["soul_bell"] },
  { id: "shop_orik", shopTypeId: "space_trader", npcId: "orik_spacer", specialStock: ["still_stone"] },
  { id: "shop_nox", shopTypeId: "void_broker_shop", npcId: "nox_broker", specialStock: ["lantern_of_nothing"] },
  { id: "shop_aelia", shopTypeId: "divine_vendor", npcId: "aelia_guide", specialStock: ["olympian_blade"] },
] as const;

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

export const QUESTS: readonly QuestDefinition[] = [
  { id: "q_first_crack", name: "The First Crack", giver: "mara_guide", major: false },
  { id: "q_stone_warden", name: "The Warden Below", giver: "torren_miner", major: true },
  { id: "q_arcane_gate", name: "A Door Made of Spell", giver: "vesa_mage", major: true },
  { id: "q_spirit_path", name: "The Road That Follows", giver: "enid_medium", major: true },
  { id: "q_star_road", name: "Across the Black", giver: "orik_spacer", major: true },
  { id: "q_abyss_gate", name: "The Last Dark Door", giver: "nox_broker", major: true },
  { id: "q_olympus", name: "Olympus", giver: "aelia_guide", major: true },
  { id: "oq_lost_cache", name: "Lost Cache", giver: null, major: false },
  { id: "oq_stranded_traveller", name: "Stranded Traveller", giver: null, major: false },
  { id: "oq_resource_trade", name: "Resource Trade", giver: null, major: false },
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
