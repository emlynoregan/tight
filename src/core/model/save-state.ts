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
  readonly type: "move" | "wait" | "interact" | "attack" | "ability" | "item";
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
}

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
}
