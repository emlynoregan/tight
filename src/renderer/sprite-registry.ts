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
    const image = new Image();
    image.src = url;
    const texture = Texture.from({
      resource: image,
      width: visual.width,
      height: visual.height,
      scaleMode: "nearest",
    });
    const refresh = () => {
      texture.source.update();
    };
    if (image.complete && image.naturalWidth > 0) {
      refresh();
    } else {
      image.addEventListener("load", refresh, { once: true });
    }
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
