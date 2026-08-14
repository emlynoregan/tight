import { GLOBAL_CONSTANTS, type GlobalConstants } from "../model/constants";
import { enumeratePlanes, type PlanePair } from "../model/plane";
import type {
  AbilityDefinition,
  AttackDefinition,
  AtomicEffect,
  BossDefinition,
  DimensionDefinition,
  EffectBundle,
  EncounterDefinition,
  HazardDefinition,
  ItemDefinition,
  MonsterSpecies,
  NpcArchetype,
  PlaneFamilyDefinition,
  PlaneOverride,
  QuestDefinition,
  ShopType,
  StaticFeature,
  StatusDefinition,
  StoryNpc,
  StructureTemplate,
  TileType,
  TransitionArchetype,
  VisibilityProfile,
} from "../model/content-types";
import { ABILITIES, ATOMIC_EFFECTS, EFFECT_BUNDLES, LEARN_EVENTS, STATUSES } from "./effects";
import { ATTACKS } from "./attacks";
import { DIMENSIONS, PLANE_FAMILIES, PLANE_OVERRIDES } from "./dimensions";
import {
  AP_REWARD_EVENTS,
  BOSS_ENCOUNTER,
  CONTAINER_TYPES,
  DROP_CHANCES,
  ENCOUNTERS,
  FIXED_REWARDS,
  GUARDIAN_ENCOUNTERS,
  GUARDIAN_REWARD_PROFILES,
  MONSTER_REWARD_PROFILES,
} from "./encounters";
import { HAZARDS, VISIBILITY_PROFILES } from "./environment";
import { ITEMS, STARTING_LOADOUT, STAPLE_SHOP_GOODS } from "./items";
import { AI_PROFILES, BOSSES, MONSTERS, PURSUIT_PROFILES } from "./monsters";
import { NPC_ARCHETYPES, QUESTS, SHOP_INSTANCES, SHOP_TYPES, STORY_NPCS } from "./npcs";
import { GENERATION_VERSIONS, STARTING_PLAYER_STATE, VICTORY } from "./progression";
import { FEATURE_RECIPES, PRIMITIVE_PROFILES, STATIC_FEATURES, STRUCTURE_TEMPLATES, TILE_TYPES } from "./terrain";
import { TRANSITION_ARCHETYPES } from "./transitions";

function indexById<T extends { id: string | number }>(rows: readonly T[]): ReadonlyMap<T["id"], T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export interface ContentRegistry {
  readonly constants: GlobalConstants;
  readonly planes: readonly PlanePair[];
  readonly dimensions: readonly DimensionDefinition[];
  readonly planeFamilies: readonly PlaneFamilyDefinition[];
  readonly planeOverrides: readonly PlaneOverride[];
  readonly tileTypes: readonly TileType[];
  readonly staticFeatures: readonly StaticFeature[];
  readonly structureTemplates: readonly StructureTemplate[];
  readonly featureRecipes: readonly string[];
  readonly primitiveProfiles: readonly { id: string }[];
  readonly attacks: readonly AttackDefinition[];
  readonly statuses: readonly StatusDefinition[];
  readonly atomicEffects: readonly AtomicEffect[];
  readonly effectBundles: readonly EffectBundle[];
  readonly abilities: readonly AbilityDefinition[];
  readonly learnEvents: Readonly<Record<string, string>>;
  readonly items: readonly ItemDefinition[];
  readonly startingLoadout: typeof STARTING_LOADOUT;
  readonly stapleShopGoods: readonly string[];
  readonly monsters: readonly MonsterSpecies[];
  readonly bosses: readonly BossDefinition[];
  readonly aiProfiles: readonly string[];
  readonly pursuitProfiles: readonly { id: string }[];
  readonly transitionArchetypes: readonly TransitionArchetype[];
  readonly encounters: readonly EncounterDefinition[];
  readonly guardianEncounters: typeof GUARDIAN_ENCOUNTERS;
  readonly bossEncounter: typeof BOSS_ENCOUNTER;
  readonly monsterRewardProfiles: typeof MONSTER_REWARD_PROFILES;
  readonly guardianRewardProfiles: typeof GUARDIAN_REWARD_PROFILES;
  readonly dropChances: typeof DROP_CHANCES;
  readonly containerTypes: typeof CONTAINER_TYPES;
  readonly fixedRewards: typeof FIXED_REWARDS;
  readonly apRewardEvents: typeof AP_REWARD_EVENTS;
  readonly npcArchetypes: readonly NpcArchetype[];
  readonly storyNpcs: readonly StoryNpc[];
  readonly shopTypes: readonly ShopType[];
  readonly shopInstances: typeof SHOP_INSTANCES;
  readonly quests: readonly QuestDefinition[];
  readonly hazards: readonly HazardDefinition[];
  readonly visibilityProfiles: readonly VisibilityProfile[];
  readonly startingPlayerState: typeof STARTING_PLAYER_STATE;
  readonly victory: typeof VICTORY;
  readonly generationVersions: typeof GENERATION_VERSIONS;
  readonly byId: {
    readonly dimension: ReadonlyMap<number, DimensionDefinition>;
    readonly tile: ReadonlyMap<string, TileType>;
    readonly feature: ReadonlyMap<string, StaticFeature>;
    readonly attack: ReadonlyMap<string, AttackDefinition>;
    readonly status: ReadonlyMap<string, StatusDefinition>;
    readonly effect: ReadonlyMap<string, AtomicEffect>;
    readonly bundle: ReadonlyMap<string, EffectBundle>;
    readonly ability: ReadonlyMap<string, AbilityDefinition>;
    readonly item: ReadonlyMap<string, ItemDefinition>;
    readonly monster: ReadonlyMap<string, MonsterSpecies>;
    readonly encounter: ReadonlyMap<string, EncounterDefinition>;
    readonly hazard: ReadonlyMap<string, HazardDefinition>;
    readonly transition: ReadonlyMap<string, TransitionArchetype>;
    readonly npcArchetype: ReadonlyMap<string, NpcArchetype>;
    readonly storyNpc: ReadonlyMap<string, StoryNpc>;
    readonly shopType: ReadonlyMap<string, ShopType>;
    readonly quest: ReadonlyMap<string, QuestDefinition>;
  };
}

export function createContentRegistry(): ContentRegistry {
  return {
    constants: GLOBAL_CONSTANTS,
    planes: enumeratePlanes(),
    dimensions: DIMENSIONS,
    planeFamilies: PLANE_FAMILIES,
    planeOverrides: PLANE_OVERRIDES,
    tileTypes: TILE_TYPES,
    staticFeatures: STATIC_FEATURES,
    structureTemplates: STRUCTURE_TEMPLATES,
    featureRecipes: FEATURE_RECIPES,
    primitiveProfiles: PRIMITIVE_PROFILES,
    attacks: ATTACKS,
    statuses: STATUSES,
    atomicEffects: ATOMIC_EFFECTS,
    effectBundles: EFFECT_BUNDLES,
    abilities: ABILITIES,
    learnEvents: LEARN_EVENTS,
    items: ITEMS,
    startingLoadout: STARTING_LOADOUT,
    stapleShopGoods: STAPLE_SHOP_GOODS,
    monsters: MONSTERS,
    bosses: BOSSES,
    aiProfiles: AI_PROFILES,
    pursuitProfiles: PURSUIT_PROFILES,
    transitionArchetypes: TRANSITION_ARCHETYPES,
    encounters: ENCOUNTERS,
    guardianEncounters: GUARDIAN_ENCOUNTERS,
    bossEncounter: BOSS_ENCOUNTER,
    monsterRewardProfiles: MONSTER_REWARD_PROFILES,
    guardianRewardProfiles: GUARDIAN_REWARD_PROFILES,
    dropChances: DROP_CHANCES,
    containerTypes: CONTAINER_TYPES,
    fixedRewards: FIXED_REWARDS,
    apRewardEvents: AP_REWARD_EVENTS,
    npcArchetypes: NPC_ARCHETYPES,
    storyNpcs: STORY_NPCS,
    shopTypes: SHOP_TYPES,
    shopInstances: SHOP_INSTANCES,
    quests: QUESTS,
    hazards: HAZARDS,
    visibilityProfiles: VISIBILITY_PROFILES,
    startingPlayerState: STARTING_PLAYER_STATE,
    victory: VICTORY,
    generationVersions: GENERATION_VERSIONS,
    byId: {
      dimension: indexById(DIMENSIONS),
      tile: indexById(TILE_TYPES),
      feature: indexById(STATIC_FEATURES),
      attack: indexById(ATTACKS),
      status: indexById(STATUSES),
      effect: indexById(ATOMIC_EFFECTS),
      bundle: indexById(EFFECT_BUNDLES),
      ability: indexById(ABILITIES),
      item: indexById(ITEMS),
      monster: indexById(MONSTERS),
      encounter: indexById(ENCOUNTERS),
      hazard: indexById(HAZARDS),
      transition: indexById(TRANSITION_ARCHETYPES),
      npcArchetype: indexById(NPC_ARCHETYPES),
      storyNpc: indexById(STORY_NPCS),
      shopType: indexById(SHOP_TYPES),
      quest: indexById(QUESTS),
    },
  };
}

export const CONTENT_REGISTRY: ContentRegistry = createContentRegistry();
