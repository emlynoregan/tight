import type { CatalogueId, FamilyId, GeneratorVersionId } from "../model/ids";
import type { DimensionNumber, PlanePair } from "../model/plane";

export type ProgressionClass =
  | "open"
  | "guardian_gate"
  | "key_gate"
  | "resource_gate"
  | "ability_gate"
  | "quest_flag_gate"
  | "optional_broken";

export type ProgressionSourceType =
  | "container"
  | "monster_drop"
  | "guardian_reward"
  | "quest_reward"
  | "npc_teaching"
  | "shop_stock"
  | "world_feature"
  | "fixed_item";

export interface PlaneNode {
  readonly plane: PlanePair;
  readonly dominantDimension: DimensionNumber;
  readonly family: FamilyId;
  readonly progressionTier: number;
}

export interface TopologyTransition {
  readonly id: CatalogueId;
  readonly sourcePlane: PlanePair;
  readonly destinationPlane: PlanePair;
  readonly archetypeId: CatalogueId;
  readonly transitionEffectProfileId: CatalogueId;
  readonly coordinateMode: "fixed" | "source_axis_copy" | "deterministic_derived";
  readonly conditionSetId: CatalogueId | null;
  readonly gateId: CatalogueId | null;
  readonly progressionClass: ProgressionClass;
  readonly initiallyBroken: boolean;
  readonly semanticTags: readonly string[];
}

export interface TopologyGate {
  readonly id: CatalogueId;
  readonly transitionId: CatalogueId;
  readonly progressionClass: ProgressionClass;
  readonly requiredFlag?: CatalogueId;
  readonly requiredItemId?: CatalogueId;
  readonly requiredAbilityId?: CatalogueId;
  readonly requiredResourceId?: CatalogueId;
  readonly requiredQuantity?: number;
  readonly guardianInstanceId?: CatalogueId;
  readonly questInstanceId?: CatalogueId;
}

export interface ProgressionSource {
  readonly id: CatalogueId;
  readonly plane: PlanePair;
  readonly sourceType: ProgressionSourceType;
  readonly grants: readonly string[];
  readonly requirements: readonly string[];
  readonly consumption: boolean;
  readonly contentReference: CatalogueId;
  readonly quantity: number;
  readonly unlimited?: boolean;
}

export interface GuardianInstance {
  readonly id: CatalogueId;
  readonly encounterId: CatalogueId;
  readonly monsterId: CatalogueId;
  readonly plane: PlanePair;
  readonly gatedTransitionId: CatalogueId;
}

export interface QuestInstance {
  readonly id: CatalogueId;
  readonly questId: CatalogueId;
  readonly plane: PlanePair;
  readonly npcId: CatalogueId | null;
  readonly flagId: CatalogueId;
}

export interface NpcInstance {
  readonly id: CatalogueId;
  readonly npcId: CatalogueId;
  readonly plane: PlanePair;
}

export interface ShopInstance {
  readonly id: CatalogueId;
  readonly shopTypeId: CatalogueId;
  readonly plane: PlanePair;
  readonly npcInstanceId: CatalogueId | null;
}

export interface OlympusBossInstance {
  readonly encounterId: "boss_olympus";
  readonly monsterId: "olympian_final";
  readonly plane: PlanePair;
  readonly arenaId: "olympus_arena";
}

export interface WorldTopology {
  readonly generatorVersion: GeneratorVersionId;
  readonly worldSeed: string;
  readonly topologyAttempt: number;
  readonly planeNodes: readonly PlaneNode[];
  readonly transitions: readonly TopologyTransition[];
  readonly gates: readonly TopologyGate[];
  readonly progressionSources: readonly ProgressionSource[];
  readonly guardianInstances: readonly GuardianInstance[];
  readonly questInstances: readonly QuestInstance[];
  readonly npcInstances: readonly NpcInstance[];
  readonly shopInstances: readonly ShopInstance[];
  readonly olympusBossInstance: OlympusBossInstance;
  readonly topologyHash: string;
}

export interface TopologyGenerationFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

export interface TopologyGenerationSuccess {
  readonly ok: true;
  readonly topology: WorldTopology;
}

export type TopologyGenerationResult = TopologyGenerationSuccess | TopologyGenerationFailure;
