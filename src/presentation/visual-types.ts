import type { FamilyId } from "../core/model/ids";
import type { Direction } from "../core/model/save-state";
import type { PlanePair } from "../core/model/plane";

export type CollisionReadability =
  | "walkable_plain"
  | "walkable_hazard"
  | "blocked_solid"
  | "interactive_blocked"
  | "transition_usable"
  | "transition_broken";

export type ActorReadability =
  | "player"
  | "friendly_npc"
  | "hostile"
  | "elite"
  | "boss"
  | "hidden";

export type VisualSource =
  | { readonly type: "svg"; readonly markup: string }
  | { readonly type: "asset"; readonly uri: string };

export type AnimationKind = "none" | "bob" | "pulse" | "flash" | "spin" | "jitter";

export interface AnimationParams {
  readonly kind: AnimationKind;
  readonly periodMs: number;
  readonly amplitude: number;
}

export interface VisualRequest {
  readonly semanticId: string;
  readonly plane?: PlanePair;
  readonly family?: FamilyId;
  readonly state?: string;
  readonly facing?: Direction;
  readonly animationState?: string;
  readonly overlays?: readonly string[];
}

export interface ResolvedVisual {
  readonly semanticId: string;
  readonly source: VisualSource;
  readonly width: number;
  readonly height: number;
  readonly animation: AnimationParams;
  readonly collisionClass: CollisionReadability | null;
  readonly actorClass: ActorReadability | null;
  readonly label: string;
}

export interface DimensionVisualProfile {
  readonly dimension: number;
  readonly name: string;
  readonly gemIdentity: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly lineWeight: number;
  readonly corner: "square" | "round" | "chamfer";
  readonly motif: string;
  readonly pattern: string;
  readonly glow: "none" | "low" | "high";
  readonly motion: AnimationKind;
}

export class MissingVisualError extends Error {
  readonly semanticId: string;
  constructor(semanticId: string) {
    super(`missing visual presentation key: ${semanticId}`);
    this.name = "MissingVisualError";
    this.semanticId = semanticId;
  }
}
