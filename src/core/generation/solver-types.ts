import type { PlanePair } from "../model/plane";

export type WitnessStepType =
  | "START"
  | "TRAVERSE_TRANSITION"
  | "DISCOVER_DIMENSION"
  | "COLLECT_SOURCE"
  | "DEFEAT_GUARDIAN"
  | "COMPLETE_QUEST"
  | "LEARN_ABILITY"
  | "ACQUIRE_KEY"
  | "BUY_ITEM"
  | "UNLOCK_GATE"
  | "REACH_OLYMPUS"
  | "FINAL_BOSS_AVAILABLE";

export interface WitnessStep {
  readonly type: WitnessStepType;
  readonly id?: string;
  readonly plane?: PlanePair;
  readonly detail?: string;
}

export interface SolverState {
  reachablePlanes: Set<string>;
  discoveredDimensions: Set<number>;
  abilities: Set<string>;
  keyItems: Set<string>;
  equipmentCapabilities: Set<string>;
  resources: Map<string, number>;
  currency: number;
  flags: Set<string>;
  defeatedGuardians: Set<string>;
  collectedSources: Set<string>;
  completedQuests: Set<string>;
  purchasedStock: Set<string>;
  unlockedGates: Set<string>;
  witness: WitnessStep[];
}

export interface UnsatisfiedGateSummary {
  readonly gateId: string;
  readonly transitionId: string;
  readonly progressionClass: string;
  readonly reason: string;
}

export interface SolverFailure {
  readonly reachablePlaneCount: number;
  readonly discoveredDimensions: readonly number[];
  readonly frontierTransitions: readonly string[];
  readonly unsatisfiedGateSummaries: readonly UnsatisfiedGateSummary[];
  readonly scarceResources: readonly string[];
  readonly unreachableProgressionSources: readonly string[];
}

export interface SolverPass {
  readonly ok: true;
  readonly witness: readonly WitnessStep[];
}

export interface SolverFail {
  readonly ok: false;
  readonly failure: SolverFailure;
}

export interface SolverSearchOptions {
  readonly prune?: boolean;
}

export type SolverResult = SolverPass | SolverFail;

export const CONSUMING_ACTION_ORDER = {
  resource_gate: 1,
  consuming_quest: 2,
  shop_purchase: 3,
  consume_item: 4,
  collect_resource: 5,
} as const;
