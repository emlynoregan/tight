import { Texture } from "pixi.js";
import type { ResolvedVisual } from "../presentation";

export class SpriteRegistry {
  private readonly textures = new Map<string, Texture>();

  texture(visual: ResolvedVisual): Texture {
    const extra = visual.source.type === "svg" ? visual.source.markup : visual.source.uri;
    const key = `${visual.semanticId}|${visual.label}|${extra.length}`;
    const existing = this.textures.get(key);
    if (existing) {
      return existing;
    }
    const url = visual.source.type === "svg" ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(visual.source.markup)}` : visual.source.uri;
    const texture = Texture.from(url);
    texture.source.scaleMode = "nearest";
    this.textures.set(key, texture);
    return texture;
  }

  destroy(): void {
    for (const texture of this.textures.values()) {
      texture.destroy(true);
    }
    this.textures.clear();
  }
}
