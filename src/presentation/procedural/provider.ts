import { CONTENT_REGISTRY, type ContentRegistry } from "../../core/data/registry";
import { requiredVisualKeys } from "../semantic-ids";
import type { VisualProvider } from "../visual-provider";
import type { DimensionVisualProfile, ResolvedVisual, VisualRequest } from "../visual-types";
import { MissingVisualError } from "../visual-types";
import { drawSemantic } from "./draw";
import { dimensionVisualProfile } from "./palettes";
import { SVG_SIZE } from "./svg";

function cacheKey(request: VisualRequest): string {
  return JSON.stringify({
    semanticId: request.semanticId,
    plane: request.plane ?? null,
    family: request.family ?? null,
    state: request.state ?? null,
    facing: request.facing ?? null,
    animationState: request.animationState ?? null,
    overlays: request.overlays ?? [],
  });
}

export class ProceduralVisualProvider implements VisualProvider {
  readonly id = "procedural";
  private readonly keys: ReadonlySet<string>;
  private readonly cache = new Map<string, ResolvedVisual>();

  constructor(registry: ContentRegistry = CONTENT_REGISTRY) {
    this.keys = new Set(requiredVisualKeys(registry));
  }

  has(semanticId: string): boolean {
    return this.keys.has(semanticId);
  }

  resolve(request: VisualRequest): ResolvedVisual {
    if (!this.has(request.semanticId)) {
      throw new MissingVisualError(request.semanticId);
    }
    const key = cacheKey(request);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const drawn = drawSemantic(request);
    const resolved: ResolvedVisual = {
      semanticId: request.semanticId,
      source: { type: "svg", markup: drawn.markup },
      width: SVG_SIZE,
      height: SVG_SIZE,
      animation: drawn.animation,
      collisionClass: drawn.collisionClass,
      actorClass: drawn.actorClass,
      label: drawn.label,
    };
    this.cache.set(key, resolved);
    return resolved;
  }

  dimensionProfile(dimension: number): DimensionVisualProfile {
    return dimensionVisualProfile(dimension);
  }
}
