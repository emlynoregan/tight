import type { VisualProvider } from "./visual-provider";
import type { DimensionVisualProfile, ResolvedVisual, VisualRequest } from "./visual-types";
import { MissingVisualError } from "./visual-types";

/** Empty until real assets are registered. Hybrid providers fall back when `has` is false. */
export class AssetVisualProvider implements VisualProvider {
  readonly id = "asset";
  private readonly overrides = new Map<string, ResolvedVisual>();

  has(semanticId: string): boolean {
    return this.overrides.has(semanticId);
  }

  put(semanticId: string, visual: ResolvedVisual): void {
    this.overrides.set(semanticId, visual);
  }

  resolve(request: VisualRequest): ResolvedVisual {
    const visual = this.overrides.get(request.semanticId);
    if (!visual) {
      throw new MissingVisualError(request.semanticId);
    }
    return visual;
  }

  dimensionProfile(dimension: number): DimensionVisualProfile {
    throw new MissingVisualError(`dimension.${dimension}`);
  }
}
