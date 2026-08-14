import type { AttributeId, CatalogueId, EquipmentSlotId, FamilyId, GeneratorVersionId } from "./ids";
import type { MapCoordinate, PlanePair } from "./plane";

export type Direction = "north" | "east" | "south" | "west";

export const DIRECTION_DELTA: Record<Direction, MapCoordinate> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

export const DIRECTIONS: readonly Direction[] = ["north", "east", "south", "west"];

export type ActorKind = "player" | "npc" | "guardian" | "monster";

export interface ItemStack {
  readonly itemId: CatalogueId;
  readonly quantity: number;
}

export type EquipmentLoadout = {
  readonly [Slot in EquipmentSlotId]: CatalogueId | null;
};

export interface IntentionalAction {
  readonly type: "move" | "wait" | "interact" | "attack" | "ability" | "item" | "thrust";
  readonly direction?: Direction;
  readonly targetId?: string;
  readonly attackId?: CatalogueId;
  readonly abilityId?: CatalogueId;
  readonly itemId?: CatalogueId;
  readonly targetX?: number;
  readonly targetY?: number;
}

export interface StatusInstance {
  id: CatalogueId;
  remainingTicks: number | "until_broken";
  sourceId: string | null;
}

export interface CooldownInstance {
  id: CatalogueId;
  remainingTicks: number;
  startedOnTick: number;
}

export type AiState = "idle" | "alert" | "chasing" | "fleeing" | "disabled";

export interface ActorState {
  readonly id: string;
  readonly definitionId: CatalogueId;
  readonly kind: ActorKind;
  plane: PlanePair;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spd: number;
  initiativeModifier: number;
  blocking: boolean;
  statuses: StatusInstance[];
  cooldowns: CooldownInstance[];
  aiState: AiState;
  ambushReleased: boolean;
  lastAffectedTick: number;
  guardX: number;
  guardY: number;
  vx: number;
  vy: number;
  aiPhaseIndex: number;
}

export function defaultAiFields(x: number, y: number): Pick<
  ActorState,
  "aiState" | "ambushReleased" | "lastAffectedTick" | "guardX" | "guardY" | "vx" | "vy" | "aiPhaseIndex"
> {
  return {
    aiState: "idle",
    ambushReleased: false,
    lastAffectedTick: -1,
    guardX: x,
    guardY: y,
    vx: 0,
    vy: 0,
    aiPhaseIndex: 0,
  };
}

export function directionFromDelta(delta: MapCoordinate): Direction | null {
  for (const direction of DIRECTIONS) {
    const step = DIRECTION_DELTA[direction];
    if (step.x === delta.x && step.y === delta.y) {
      return direction;
    }
  }
  return null;
}

export interface PlayerState {
  attributes: Record<AttributeId, number>;
  unspentAp: number;
  currency: number;
  equipment: EquipmentLoadout;
  inventory: ItemStack[];
  learnedAbilities: CatalogueId[];
  safeAnchor: { plane: PlanePair; x: number; y: number };
}

export interface FeatureInstanceState {
  plane: PlanePair;
  x: number;
  y: number;
  state: string;
}

export type PursuitMode = "follow_same_transition" | "phase_to_arrival" | "emerge_adjacent";

export type PursuitArrivalRule = "exact" | "exact_or_fail" | "adjacent_nesw" | "nearest_legal";

export interface PursuitHandoff {
  actorId: string;
  sourcePlane: PlanePair;
  transitionId: string;
  destinationPlane: PlanePair;
  remainingDelay: number;
  pursuitMode: PursuitMode;
  arrivalRule: PursuitArrivalRule;
  arrivalX: number;
  arrivalY: number;
}

export interface LastTransition {
  plane: PlanePair;
  x: number;
  y: number;
}

export interface PendingPlayerTransition {
  sourcePlane: PlanePair;
  sourceCell: MapCoordinate;
  transitionId: string;
  destinationPlane: PlanePair;
  arrival: MapCoordinate;
  pursuitAllowed: boolean;
  archetypeId: string;
  profileId: string;
}

export interface SaveState {
  generatorVersion: GeneratorVersionId;
  worldSeed: string;
  topologyHash: string;
  tick: number;
  plane: PlanePair;
  family: FamilyId;
  discoveredDimensions: number[];
  discoveredPlanes: PlanePair[];
  modal: string | null;
  heldDirection: Direction | null;
  heldDirectionChanged: boolean;
  actionQueue: IntentionalAction[];
  player: PlayerState;
  actors: ActorState[];
  flags: string[];
  featureStates: FeatureInstanceState[];
  pursuits: PursuitHandoff[];
  consumedTransitionIds: string[];
  lastTransition: LastTransition | null;
}
