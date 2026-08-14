import type {
  AttackChannelId,
  AttributeId,
  CatalogueId,
  ChannelStateId,
  DamageTypeId,
  EquipmentSlotId,
  FamilyId,
  RarityId,
  ResistanceStateId,
  TargetingShapeId,
} from "./ids";
import type { DimensionNumber, PlanePair } from "./plane";

export interface DimensionDefinition {
  readonly id: DimensionNumber;
  readonly name: string;
  readonly family: FamilyId;
  readonly coreIdea: string;
  readonly favouredAttributes: readonly AttributeId[];
  readonly typicalContent: string;
  readonly discoveryText: string;
  readonly terrainTags: readonly string[];
  readonly monsterTags: readonly string[];
  readonly itemTags: readonly string[];
  readonly transitionTags: readonly string[];
  readonly favouredChannels: readonly AttackChannelId[];
  readonly suppressedChannels: readonly AttackChannelId[];
  readonly gemIdentity: string;
  readonly paletteMotif: string;
  readonly audioMotif: string;
}

export type PhysicsProfileId =
  | "bounded"
  | "wrap"
  | "ethereal_edges"
  | "space_velocity"
  | "void_visibility"
  | "olympus";

export interface PlaneFamilyDefinition {
  readonly id: FamilyId;
  readonly dimensions: readonly [DimensionNumber, DimensionNumber];
  readonly physics: PhysicsProfileId;
  readonly channelModifiers: Readonly<Record<AttackChannelId, ChannelStateId>>;
  readonly defaultVisibility: CatalogueId;
  readonly walkableTargetMin: number;
  readonly walkableTargetMax: number;
  readonly majorRegionsMin: number;
  readonly majorRegionsMax: number;
  readonly structuresMin: number;
  readonly structuresMax: number;
  readonly hazardDensityMinPercent: number;
  readonly hazardDensityMaxPercent: number;
}

export interface PlaneOverride {
  readonly plane: PlanePair;
  readonly name: string;
  readonly required: readonly string[];
}

export interface TileType {
  readonly id: CatalogueId;
  readonly walkable: boolean;
  readonly blocksLos: boolean;
  readonly blocksLoe: boolean;
  readonly allowsItems: boolean;
  readonly allowsActors: boolean;
  readonly hazardId: CatalogueId | null;
  readonly tags: readonly string[];
}

export interface StaticFeature {
  readonly id: CatalogueId;
  readonly blocksMovement: boolean | "state";
  readonly blocksLos: boolean | "state";
  readonly interact: boolean;
  readonly destructible: boolean;
  readonly tags: readonly string[];
}

export type PrimitiveIntensity = "low" | "medium" | "high";

export type PrimitiveProfile =
  | {
      readonly id: CatalogueId;
      readonly kind: "blob";
      readonly areaMin: number;
      readonly areaMax: number;
      readonly compactness: PrimitiveIntensity;
      readonly branchiness: PrimitiveIntensity;
    }
  | {
      readonly id: CatalogueId;
      readonly kind: "line";
      readonly widthMin: number;
      readonly widthMax: number;
      readonly straightness: PrimitiveIntensity;
    }
  | {
      readonly id: CatalogueId;
      readonly kind: "path";
      readonly widthMin: number;
      readonly widthMax: number;
      readonly wander: PrimitiveIntensity;
    }
  | {
      readonly id: CatalogueId;
      readonly kind: "rectangle";
      readonly widthMin: number;
      readonly widthMax: number;
      readonly heightMin: number;
      readonly heightMax: number;
    }
  | {
      readonly id: CatalogueId;
      readonly kind: "strip";
      readonly width: number;
      readonly lengthMin: number;
      readonly lengthMax: number;
    }
  | {
      readonly id: CatalogueId;
      readonly kind: "cluster";
      readonly countMin: number;
      readonly countMax: number;
      readonly radius: number;
    }
  | {
      readonly id: CatalogueId;
      readonly kind: "scatter";
      readonly density: "low" | "medium";
      readonly minSpacing: number;
    };

export interface FeatureRecipeStep {
  readonly primitiveId?: CatalogueId;
  readonly templateId?: CatalogueId;
  readonly featureId?: CatalogueId;
  readonly tileId?: CatalogueId;
  readonly optional?: boolean;
  readonly countMin?: number;
  readonly countMax?: number;
  readonly notes?: string;
}

export interface FeatureRecipe {
  readonly id: CatalogueId;
  readonly family: FamilyId | "any";
  readonly steps: readonly FeatureRecipeStep[];
}

export interface StructureTemplate {
  readonly id: CatalogueId;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly requiredCells: readonly string[];
}

export interface AttackDefinition {
  readonly id: CatalogueId;
  readonly name: string;
  readonly attributes: readonly AttributeId[];
  readonly channel: AttackChannelId;
  readonly accuracy: number;
  readonly power: number;
  readonly range: number;
  readonly shape: TargetingShapeId;
  readonly defence: AttributeId;
  readonly damageType: DamageTypeId | null;
  readonly requiresLos: boolean;
  readonly cooldown: number;
  readonly tags: readonly string[];
  readonly onHitStatusId: CatalogueId | null;
}

export interface StatusDefinition {
  readonly id: CatalogueId;
  readonly name: string;
  readonly durationTicks: number | "until_broken";
  readonly effectSummary: string;
}

export type EffectKind =
  | "heal"
  | "damage"
  | "applyStatus"
  | "removeStatus"
  | "forcedMove"
  | "teleportWithinPlane"
  | "clearVelocity"
  | "revealTiles"
  | "extraActionOnce";

export interface AtomicEffect {
  readonly id: CatalogueId;
  readonly kind: EffectKind;
  readonly amount?: number;
  readonly statusId?: CatalogueId;
  readonly damageType?: DamageTypeId;
  readonly noHitRoll?: boolean;
}

export interface EffectBundle {
  readonly id: CatalogueId;
  readonly effectIds: readonly CatalogueId[];
}

export interface AbilityDefinition {
  readonly id: CatalogueId;
  readonly name: string;
  readonly attackId: CatalogueId | null;
  readonly effectOrBundleId: CatalogueId | null;
  readonly cooldown: number;
  readonly tags: readonly string[];
  readonly acquisitionClass?: string;
  readonly kind: "combat" | "dimensional" | "item" | "monster" | "learn_event";
}

export interface ItemDefinition {
  readonly id: CatalogueId;
  readonly name: string;
  readonly kind:
    | "weapon"
    | "offhand"
    | "body"
    | "head"
    | "charm"
    | "artefact"
    | "consumable"
    | "resource"
    | "key"
    | "currency";
  readonly rarity: RarityId;
  readonly slot: EquipmentSlotId | null;
  readonly attackIds: readonly CatalogueId[];
  readonly grantedAbilityIds: readonly CatalogueId[];
  readonly value: number;
  readonly stackSize: number;
  readonly tags: readonly string[];
  readonly useAbilityId: CatalogueId | null;
}

export interface AttributeBlock {
  readonly str: number;
  readonly dex: number;
  readonly con: number;
  readonly spd: number;
  readonly wis: number;
  readonly int: number;
  readonly cha: number;
  readonly psy: number;
}

export interface ResistanceEntry {
  readonly damageType: DamageTypeId;
  readonly state: ResistanceStateId;
}

export interface MonsterSpecies {
  readonly id: CatalogueId;
  readonly role: string;
  readonly baseTier: number;
  readonly attributes: AttributeBlock;
  readonly hpModifier: number;
  readonly hpOverride: number | null;
  readonly aiProfile: CatalogueId;
  readonly inPlaneAi?: CatalogueId;
  readonly detection: number | "unlimited";
  readonly attackIds: readonly CatalogueId[];
  readonly abilityIds: readonly CatalogueId[];
  readonly resistances: readonly ResistanceEntry[];
  readonly pursuitProfile: CatalogueId;
  readonly scalingOrder: readonly AttributeId[];
  readonly rewardProfile: CatalogueId | null;
  readonly traits: readonly string[];
  readonly boss: boolean;
  readonly guardianOf?: PlanePair;
}

export interface BossPhase {
  readonly name: string;
  readonly hpAtMostPercent: number | null;
  readonly ai: CatalogueId;
  readonly attackIds: readonly CatalogueId[];
}

export interface BossDefinition {
  readonly id: CatalogueId;
  readonly speciesId: CatalogueId;
  readonly phases: readonly BossPhase[];
}

export interface TransitionArchetype {
  readonly id: CatalogueId;
  readonly activation: "step_on" | "interact" | "edge_cross";
  readonly pursuitCategory: CatalogueId | null;
  readonly brokenVariant: string | null;
  readonly defaultCoordinateMode: CatalogueId;
  readonly pursuitAllowed: boolean;
  readonly singleUseDefault: boolean;
  readonly forcedActivation: boolean;
}

export interface EncounterDefinition {
  readonly id: CatalogueId;
  readonly tierMin: number;
  readonly tierMax: number;
  readonly role: CatalogueId;
  readonly pattern: CatalogueId;
  readonly weight: number;
  readonly slots: readonly EncounterSlot[];
}

export interface EncounterSlot {
  readonly monsterId: CatalogueId;
  readonly min: number;
  readonly max: number;
  readonly optional: boolean;
}

export interface NpcArchetype {
  readonly id: CatalogueId;
  readonly roles: readonly string[];
  readonly dimensionMin: number;
  readonly dimensionMax: number;
  readonly behaviour: CatalogueId;
}

export interface StoryNpc {
  readonly id: CatalogueId;
  readonly name: string;
  readonly archetypeId: CatalogueId;
  readonly roleSummary: string;
}

export interface ShopType {
  readonly id: CatalogueId;
  readonly stapleItemIds: readonly CatalogueId[];
  readonly limitedPoolItemIds: readonly CatalogueId[];
  readonly limitedPickCount: number;
  readonly maxRareExtras: number;
}

export interface ShopStockEntry {
  readonly itemId: CatalogueId;
  readonly priceOverride: number | null;
}

export interface ShopInstanceDefinition {
  readonly id: CatalogueId;
  readonly shopTypeId: CatalogueId;
  readonly npcId: CatalogueId | null;
  readonly anchorNpcId: CatalogueId | null;
  readonly onStartingPlane: boolean;
  readonly specialStock: readonly ShopStockEntry[];
}

export type QuestObjective =
  | { readonly type: "speak_to_giver" }
  | { readonly type: "reach_dimension"; readonly dimension: number }
  | { readonly type: "defeat_encounter"; readonly encounterId: CatalogueId }
  | { readonly type: "recover_and_return" }
  | { readonly type: "activate_or_deliver" }
  | { readonly type: "deliver_resources"; readonly countMin: number; readonly countMax: number };

export interface QuestRewards {
  readonly flagIds: readonly CatalogueId[];
  readonly learnAbilityIds: readonly CatalogueId[];
  readonly apEventId: CatalogueId | null;
  readonly bindsGeneratedGuardianGate: boolean;
  readonly coinMin?: number;
  readonly coinMax?: number;
}

export interface QuestDefinition {
  readonly id: CatalogueId;
  readonly name: string;
  readonly giver: CatalogueId | null;
  readonly major: boolean;
  readonly usableAsProgressionGate: boolean;
  readonly objectives: readonly QuestObjective[];
  readonly rewards: QuestRewards;
}

export interface AbilityAcquisition {
  readonly abilityId: CatalogueId;
  readonly questId: CatalogueId | null;
  readonly giverNpcId: CatalogueId | null;
  readonly prerequisiteEncounterId: CatalogueId | null;
  readonly fixedRewardId: CatalogueId | null;
}

export interface HazardDefinition {
  readonly id: CatalogueId;
  readonly triggers: readonly ("onEnter" | "onEndTick")[];
  readonly effectIds: readonly CatalogueId[];
  readonly protectionTag: CatalogueId | null;
  readonly visible: boolean;
  readonly consumed: boolean;
}

export interface VisibilityProfile {
  readonly id: CatalogueId;
  readonly radius: number | "unlimited";
}

export interface PresentationStatus {
  readonly id: CatalogueId;
  readonly label: string;
}
