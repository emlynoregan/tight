import type { DimensionVisualProfile, ResolvedVisual, VisualRequest } from "./visual-types";

export interface VisualProvider {
  readonly id: string;
  has(semanticId: string): boolean;
  resolve(request: VisualRequest): ResolvedVisual;
  dimensionProfile(dimension: number): DimensionVisualProfile;
}
