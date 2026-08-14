import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT_REGISTRY, createAcceptedWorldCache, createNewGame, hashSaveState } from "../../src/core";
import {
  AssetVisualProvider,
  HybridVisualProvider,
  MissingVisualError,
  MockVisualProvider,
  PresentationFacade,
  ProceduralVisualProvider,
  requiredVisualKeys,
  SilentAudioProvider,
} from "../../src/presentation";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walkFiles(path));
    } else if (path.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("procedural visual provider", () => {
  const provider = new ProceduralVisualProvider();
  const keys = requiredVisualKeys(CONTENT_REGISTRY);

  it("resolves every required v1 visual key to SVG markup", () => {
    expect(keys.length).toBeGreaterThan(100);
    for (const semanticId of keys) {
      const visual = provider.resolve({ semanticId });
      expect(visual.semanticId).toBe(semanticId);
      expect(visual.source.type).toBe("svg");
      if (visual.source.type === "svg") {
        expect(visual.source.markup).toContain("<svg");
        expect(visual.source.markup).toContain("</svg>");
      }
      expect(visual.width).toBe(32);
      expect(visual.height).toBe(32);
      expect(visual.label.length).toBeGreaterThan(0);
    }
  });

  it("throws MissingVisualError for unknown keys", () => {
    expect(() => provider.resolve({ semanticId: "tile.no_such_tile" })).toThrow(MissingVisualError);
    try {
      provider.resolve({ semanticId: "monster.not_in_catalogue" });
    } catch (error) {
      expect(error).toBeInstanceOf(MissingVisualError);
      expect((error as MissingVisualError).semanticId).toBe("monster.not_in_catalogue");
    }
  });

  it("is deterministic for identical requests", () => {
    const request = { semanticId: "monster.rat", facing: "east" as const };
    const first = new ProceduralVisualProvider().resolve(request);
    const second = new ProceduralVisualProvider().resolve(request);
    expect(first).toEqual(second);
    expect(first.source).toEqual(provider.resolve(request).source);
  });

  it("may change appearance with plane context", () => {
    const grass = { semanticId: "tile.grass" };
    const field = provider.resolve({ ...grass, plane: { a: 0, b: 1 } });
    const sorcery = provider.resolve({ ...grass, plane: { a: 6, b: 7 } });
    expect(field.source).not.toEqual(sorcery.source);
    expect(field.source.type).toBe("svg");
    expect(sorcery.source.type).toBe("svg");
  });

  it("does not mutate save state when resolving visuals", () => {
    const runtime = createNewGame("tight-v1", "0", { cache: createAcceptedWorldCache() });
    const before = hashSaveState(runtime.save);
    for (const semanticId of keys) {
      provider.resolve({ semanticId, plane: runtime.save.plane });
    }
    expect(hashSaveState(runtime.save)).toBe(before);
  });

  it("distinguishes door states without relying on colour alone", () => {
    const closed = provider.resolve({ semanticId: "feature.door.closed" });
    const open = provider.resolve({ semanticId: "feature.door.open" });
    const locked = provider.resolve({ semanticId: "feature.door.locked" });
    expect(closed.source).not.toEqual(open.source);
    expect(closed.source).not.toEqual(locked.source);
    expect(open.source).not.toEqual(locked.source);
    expect(open.collisionClass).toBe("walkable_plain");
  });
});

describe("replaceable providers", () => {
  it("lets a mock satisfy the same VisualProvider interface", () => {
    const mock = new MockVisualProvider();
    const facade = new PresentationFacade(mock);
    const visual = facade.resolveVisual({ semanticId: "actor.player" });
    expect(visual.source.type).toBe("svg");
    if (visual.source.type === "svg") {
      expect(visual.source.markup).toContain("<svg");
      expect(visual.source.markup).toContain("actor.player");
    }
    expect(() => mock.resolve({ semanticId: "ui.not_a_key" })).toThrow(MissingVisualError);
    expect(facade.audio).toBeInstanceOf(SilentAudioProvider);
    expect(facade.resolveAudio({ semanticId: "sfx.hit" }).silent).toBe(true);
  });

  it("uses hybrid primary overrides then procedural fallback", () => {
    const procedural = new ProceduralVisualProvider();
    const assets = new AssetVisualProvider();
    const override = procedural.resolve({ semanticId: "tile.grass" });
    const custom: typeof override = {
      ...override,
      source: { type: "svg", markup: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='#ff00ff'/></svg>" },
      label: "authored grass",
    };
    assets.put("tile.grass", custom);
    const hybrid = new HybridVisualProvider(assets, procedural);
    expect(hybrid.has("tile.grass")).toBe(true);
    expect(hybrid.resolve({ semanticId: "tile.grass" }).label).toBe("authored grass");
    expect(hybrid.resolve({ semanticId: "tile.dirt" })).toEqual(procedural.resolve({ semanticId: "tile.dirt" }));
    expect(hybrid.dimensionProfile(0)).toEqual(procedural.dimensionProfile(0));
    expect(assets.has("tile.dirt")).toBe(false);
  });
});

describe("presentation isolation", () => {
  it("keeps SVG and presentation imports out of core", () => {
    const coreFiles = walkFiles(join(ROOT, "src/core"));
    expect(coreFiles.length).toBeGreaterThan(10);
    for (const file of coreFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["'].*presentation/);
      expect(source, file).not.toMatch(/<svg/);
    }
    expect(JSON.stringify(CONTENT_REGISTRY)).not.toMatch(/<svg/);
  });
});
