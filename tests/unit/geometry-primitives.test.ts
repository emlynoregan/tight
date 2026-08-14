import { describe, expect, it } from "vitest";
import {
  generateBlob,
  generateCluster,
  generateLine,
  generateRectangle,
  generateRing,
  generateScatter,
  generateStamp,
  generateStrip,
  generateWanderPath,
  rasterizeBresenham,
  semanticHashHex,
} from "../../src/core";
import { primitiveParts } from "../../src/core/generation/geometry-primitives";
import type { PrimitiveContext } from "../../src/core/generation/plane-types";

const ctx: PrimitiveContext = {
  generatorVersion: "tight-v1",
  worldSeed: "geometry-fixture",
  plane: { a: 0, b: 1 },
  purposeTag: "majorFeatures",
  featureRecipeInstanceId: "test.recipe.0",
  primitiveOrdinal: 0,
  attempt: 0,
};

const inMap = (cell: { x: number; y: number }): boolean => cell.x >= 0 && cell.y >= 0 && cell.x < 16 && cell.y < 16;

function cellsHash(cells: readonly { x: number; y: number }[]): string {
  return semanticHashHex(
    primitiveParts(ctx, "hash").concat(
      cells.flatMap((cell) => [{ kind: "coord" as const, value: cell }]),
    ),
  );
}

describe("geometry primitives", () => {
  it("rasterizes Bresenham identically for a known segment", () => {
    expect(rasterizeBresenham({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });

  it("emits stable rectangle, strip, blob, cluster, scatter, ring and path hashes", () => {
    const rect = generateRectangle(ctx, 4, 3, inMap, true);
    const strip = generateStrip({ ...ctx, primitiveOrdinal: 1 }, 1, 5, inMap);
    const blob = generateBlob({ ...ctx, primitiveOrdinal: 2 }, 12, "high", "low", inMap);
    const cluster = generateCluster({ ...ctx, primitiveOrdinal: 3 }, 4, 3, 1, inMap, 3, true);
    const scatter = generateScatter({ ...ctx, primitiveOrdinal: 4 }, "low", 2, inMap);
    const ring = generateRing({ ...ctx, primitiveOrdinal: 5 }, 2, 1, inMap);
    const line = generateLine({ x: 1, y: 1 }, { x: 8, y: 4 }, 1, inMap);
    const path = generateWanderPath({ ...ctx, primitiveOrdinal: 6 }, { x: 0, y: 0 }, { x: 5, y: 7 }, "medium", 1, inMap);
    expect(rect.ok && strip.ok && blob.ok && cluster.ok && scatter.ok && ring.ok && line.ok && path.ok).toBe(true);
    if (!rect.ok || !strip.ok || !blob.ok || !cluster.ok || !scatter.ok || !ring.ok || !line.ok || !path.ok) {
      return;
    }
    const hashes = {
      rect: cellsHash(rect.cells),
      strip: cellsHash(strip.cells),
      blob: cellsHash(blob.cells),
      cluster: cellsHash(cluster.cells),
      scatter: cellsHash(scatter.cells),
      ring: cellsHash(ring.cells),
      line: cellsHash(line.cells),
      path: cellsHash(path.cells),
    };
    expect(generateRectangle(ctx, 4, 3, inMap, true)).toEqual(rect);
    expect(blob.cells).toHaveLength(12);
    expect(hashes).toEqual({
      rect: "59d8395b410c43c9fbfd1da7e48cad4a6c89afc24683a6042f35de465ea5a9f7",
      strip: "98caeefcb87e2e2a660c56ef2e9eb7425be0e55283c4739f82852227c017eaee",
      blob: "961176e437186c1d7a55b9436e5b4dbdea46fe6675038c9f0e0ffa9e888e5a13",
      cluster: "35bf45416c9fe3a3e19ce5ec8e49dd0f61b3cb19c5f73573b51de3b62dc86f64",
      scatter: "936c1624f7cc98d100d706a50cc4268cfef9c84cde2ec8b11340ad08d91a70d9",
      ring: "c626b295c24f69fe824f01afbe9f04a87c344db3f5b8c7d068212d193c164bc9",
      line: "25ab36e0bb239c622e4401b48eca3f992c64bcc7d20a713ddc494f99584dc7a9",
      path: "ab59dadbbf301d2ac1c8fb355a2054da4f54f2bc456eae47a72a633d2a1385f5",
    });
  });

  it("places a stamp with transformed named points", () => {
    const stamp = generateStamp(
      ctx,
      {
        cells: [
          ["wall_stone", "wall_stone"],
          ["wall_stone", null],
        ],
        namedPoints: { entrance: { x: 1, y: 1 } },
      },
      ["identity", "rotate90", "rotate180", "rotate270", "mirrorH"],
      inMap,
    );
    expect(stamp.ok).toBe(true);
    if (!stamp.ok) {
      return;
    }
    expect(stamp.namedPoints?.entrance).toBeDefined();
    expect(generateStamp(
      ctx,
      {
        cells: [
          ["wall_stone", "wall_stone"],
          ["wall_stone", null],
        ],
        namedPoints: { entrance: { x: 1, y: 1 } },
      },
      ["identity", "rotate90", "rotate180", "rotate270", "mirrorH"],
      inMap,
    )).toEqual(stamp);
  });
});
