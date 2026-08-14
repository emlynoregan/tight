import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  boundedInt,
  boundedUnit,
  bytesToHex,
  chance,
  percentile,
  randomUint64,
  semantic,
  semanticHashHex,
  sha256,
  weightedChoice,
  weightedRank,
} from "../../src/core";

const abcDigest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const emptyDigest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("sha256", () => {
  it("matches FIPS 180-4 empty and abc vectors", () => {
    expect(bytesToHex(sha256(new Uint8Array()))).toBe(emptyDigest);
    expect(bytesToHex(sha256(new TextEncoder().encode("abc")))).toBe(abcDigest);
  });
});

describe("semantic random contract", () => {
  const purpose = [semantic.string("tight.v1.test"), semantic.string("vector")];

  it("is stable for identical inputs", () => {
    const hex = semanticHashHex(purpose);
    expect(semanticHashHex([...purpose])).toBe(hex);
    expect(randomUint64(purpose)).toBe(randomUint64(purpose));
    expect(hex).toHaveLength(64);
  });

  it("keeps purpose-tag domains independent", () => {
    const a = randomUint64([semantic.string("topology.edge"), semantic.i64(0)]);
    const b = randomUint64([semantic.string("combat.hit"), semantic.i64(0)]);
    expect(a).not.toBe(b);
  });

  it("appends ordinals as independent draws", () => {
    const base = [semantic.string("draw")];
    expect(boundedInt(base, 0, 9, 0)).not.toBe(boundedInt(base, 0, 9, 1));
  });

  it("encodes planes and coordinates", () => {
    const planeHash = semanticHashHex([semantic.plane({ a: 8, b: 3 })]);
    expect(semanticHashHex([semantic.plane({ a: 3, b: 8 })])).toBe(planeHash);
    expect(percentile([semantic.coord({ x: 0, y: 15 })])).toBeGreaterThanOrEqual(0);
    expect(percentile([semantic.coord({ x: 0, y: 15 })])).toBeLessThan(100);
  });

  it("uses rejection sampling for bounded draws", () => {
    const counts = [0, 0];
    for (let i = 0; i < 400; i += 1) {
      counts[boundedUnit([semantic.string("coin"), semantic.i64(i)], 2)]! += 1;
    }
    expect(counts[0]).toBeGreaterThan(120);
    expect(counts[1]).toBeGreaterThan(120);
  });

  it("treats chance 0 and 100 as constants", () => {
    expect(chance([semantic.string("never")], 0)).toBe(false);
    expect(chance([semantic.string("always")], 100)).toBe(true);
  });

  it("sorts weighted rows by lowercase UTF-8 id before scanning", () => {
    const parts = [semantic.string("pick")];
    const entries = [
      { id: "zeta", weight: 1, value: "zeta" },
      { id: "Alpha", weight: 1, value: "alpha" },
      { id: "beta", weight: 0, value: "beta" },
    ];
    const chosen = weightedChoice(parts, entries);
    expect(["alpha", "zeta"]).toContain(chosen);
    const ranked = weightedRank(parts, entries);
    expect(ranked).toHaveLength(2);
    expect(ranked).toContain("alpha");
    expect(ranked).toContain("zeta");
    expect(ranked).not.toContain("beta");
  });
});

describe("generation-version regression vectors", () => {
  it("freezes canonical v1 semantic hashes", () => {
    expect(
      semanticHashHex([
        semantic.string("tight-v1"),
        semantic.string("worldSeed"),
        semantic.i64(1),
        semantic.plane({ a: 0, b: 1 }),
        semantic.coord({ x: 4, y: 7 }),
        semantic.bool(true),
      ]),
    ).toBe("1611af6bf28520d55b7a8be8a2a70e0a2a0b7d0b0c83bf8b7d0a647713c333af");
    expect(
      randomUint64([
        semantic.string("tight-v1"),
        semantic.string("worldSeed"),
        semantic.i64(1),
      ]).toString(),
    ).toBe("11698533879605996152");
    expect(boundedInt([semantic.string("tight-v1"), semantic.string("bound")], 0, 15)).toBe(5);
  });
});

describe("authoritative Math.random ban", () => {
  it("does not call Math.random in src/core", () => {
    const root = join(process.cwd(), "src", "core");
    const hits: string[] = [];

    function walk(dir: string): void {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!path.endsWith(".ts")) {
          continue;
        }
        const source = readFileSync(path, "utf8");
        if (source.includes("Math.random")) {
          hits.push(path);
        }
      }
    }

    walk(root);
    expect(hits).toEqual([]);
  });
});
