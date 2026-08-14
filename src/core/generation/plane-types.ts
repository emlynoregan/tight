import type { FamilyId } from "../model/ids";
import type { MapCoordinate, PlanePair } from "../model/plane";

export type CellKey = string;

export interface NamedPoint {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

export interface SpawnRegion {
  readonly tag: string;
  readonly cells: readonly MapCoordinate[];
}

export interface PlaneTransitionFixture {
  readonly transitionId: string;
  readonly x: number;
  readonly y: number;
}

export interface PlaneRepairEvent {
  readonly rule: string;
  readonly detail: string;
  readonly x?: number;
  readonly y?: number;
}

export interface PlaneValidationIssue {
  readonly validator: string;
  readonly detail: string;
}

export interface PlaneGrid {
  terrain: string[][];
  features: (string | null)[][];
  featureOrigin: ("required" | "scatter" | "cluster" | "furniture" | "structure" | "decoration" | null)[][];
}

export interface PlaneBase {
  readonly generatorVersion: string;
  readonly worldSeed: string;
  readonly plane: PlanePair;
  readonly family: FamilyId;
  readonly wraps: boolean;
  readonly terrain: readonly (readonly string[])[];
  readonly features: readonly (readonly (string | null)[])[];
  readonly namedPoints: readonly NamedPoint[];
  readonly spawnRegions: readonly SpawnRegion[];
  readonly transitionFixtures: readonly PlaneTransitionFixture[];
  readonly repairs: readonly PlaneRepairEvent[];
  readonly planeHash: string;
}

export interface PlaneGenerationFailure {
  readonly ok: false;
  readonly code: "PLANE_GEOMETRY_FAILURE";
  readonly message: string;
  readonly issues: readonly PlaneValidationIssue[];
  readonly plane: PlanePair;
}

export interface PlaneGenerationSuccess {
  readonly ok: true;
  readonly plane: PlaneBase;
}

export type PlaneGenerationResult = PlaneGenerationSuccess | PlaneGenerationFailure;

export const INTERACTION_POINT_KINDS = new Set([
  "approach",
  "customer",
  "transition",
  "playerEntry",
  "bossSpawn",
  "centre",
  "source-interact",
]);

export interface PrimitiveContext {
  readonly generatorVersion: string;
  readonly worldSeed: string;
  readonly plane: PlanePair;
  readonly purposeTag: string;
  readonly featureRecipeInstanceId: string;
  readonly primitiveOrdinal: number;
  readonly attempt: number;
}

export type PrimitiveResult =
  | { readonly ok: true; readonly cells: readonly MapCoordinate[] }
  | { readonly ok: false; readonly reason: string };
