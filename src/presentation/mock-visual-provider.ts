import { CONTENT_REGISTRY, type ContentRegistry } from "../core/data/registry";
import { requiredVisualKeys } from "./semantic-ids";
import type { VisualProvider } from "./visual-provider";
import type { DimensionVisualProfile, ResolvedVisual, VisualRequest } from "./visual-types";
import { MissingVisualError } from "./visual-types";
import { dimensionVisualProfile } from "./procedural/palettes";
import { attr, circle, fingerprint, rect, svg, SVG_SIZE } from "./procedural/svg";

function placeholderMarkup(semanticId: string): string {
  const n = fingerprint(semanticId);
  const x = 8 + (n % 16);
  const y = 8 + ((n >>> 8) % 16);
  return svg(
    `<title>${attr(semanticId)}</title>` +
      rect(0, 0, SVG_SIZE, SVG_SIZE, "#2a3038") +
      rect(4, 4, 24, 24, "none", ` stroke="#c8d0d8" stroke-width="1.5"`) +
      circle(x, y, 3, "#e8d080"),
  );
}

export class MockVisualProvider implements VisualProvider {
  readonly id = "mock";
  private readonly keys: ReadonlySet<string>;

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
    return {
      semanticId: request.semanticId,
      source: { type: "svg", markup: placeholderMarkup(request.semanticId) },
      width: SVG_SIZE,
      height: SVG_SIZE,
      animation: { kind: "none", periodMs: 0, amplitude: 0 },
      collisionClass: null,
      actorClass: null,
      label: request.semanticId,
    };
  }

  dimensionProfile(dimension: number): DimensionVisualProfile {
    return dimensionVisualProfile(dimension);
  }
}
