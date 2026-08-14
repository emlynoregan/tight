import type { VisualProvider } from "./visual-provider";
import type { DimensionVisualProfile, ResolvedVisual, VisualRequest } from "./visual-types";

export class HybridVisualProvider implements VisualProvider {
  readonly id = "hybrid";

  constructor(
    private readonly primary: VisualProvider,
    private readonly fallback: VisualProvider,
  ) {}

  has(semanticId: string): boolean {
    return this.primary.has(semanticId) || this.fallback.has(semanticId);
  }

  resolve(request: VisualRequest): ResolvedVisual {
    if (this.primary.has(request.semanticId)) {
      return this.primary.resolve(request);
    }
    return this.fallback.resolve(request);
  }

  dimensionProfile(dimension: number): DimensionVisualProfile {
    if (this.primary.has(`gem.${dimension}.known`)) {
      return this.primary.dimensionProfile(dimension);
    }
    return this.fallback.dimensionProfile(dimension);
  }
}
