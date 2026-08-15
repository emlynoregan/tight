import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deterministicSweepSeeds, sweepAcceptedWorlds } from "../../src/core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ROOT, "fixtures", "accepted-world-sweep-32.json");
const CANONICAL_ZERO = "ca58a14df09cfe39d90fa1f4e47344a80a3671b3fda85408e9ebb9972b21b708";
const CANONICAL_ONE = "459de820a3c65be611f372c95d61905250cd06b1ba17a1f598144e9a4495d7c5";
const RELEASE = Number(process.env.TIGHT_SEED_SWEEP_RELEASE ?? "0");

describe.skipIf(RELEASE < 32)("release accepted-world sweep", () => {
  it(`accepts ${RELEASE} full getAcceptedWorld seeds`, () => {
    const report = sweepAcceptedWorlds(deterministicSweepSeeds(RELEASE), "tight-v1", { maxAttempts: 8 });
    expect(report.failed).toEqual([]);
    expect(report.accepted).toBe(RELEASE);
    const zero = report.rows.find((row) => row.seed === "0");
    const one = report.rows.find((row) => row.seed === "1");
    expect(zero?.topologyHash).toBe(CANONICAL_ZERO);
    expect(one?.topologyHash).toBe(CANONICAL_ONE);
    if (process.env.TIGHT_WRITE_SWEEP === "1") {
      writeFileSync(FIXTURE, `${JSON.stringify(report, null, 2)}\n`);
    }
  }, 600_000);
});

describe.skipIf(!existsSync(FIXTURE))("recorded 32-seed release sweep", () => {
  it("retains a completed 32-seed accepted-world run with canonical hashes", () => {
    expect(existsSync(FIXTURE)).toBe(true);
    const recorded = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      accepted: number;
      failed: unknown[];
      rows: readonly { seed: string; topologyHash: string; acceptedAttempt: number }[];
      meanWitnessLength: number;
      elapsedMs: number;
    };
    expect(recorded.failed).toEqual([]);
    expect(recorded.accepted).toBeGreaterThanOrEqual(32);
    expect(recorded.rows).toHaveLength(recorded.accepted);
    expect(recorded.rows.find((row) => row.seed === "0")?.topologyHash).toBe(CANONICAL_ZERO);
    expect(recorded.rows.find((row) => row.seed === "1")?.topologyHash).toBe(CANONICAL_ONE);
    expect(recorded.meanWitnessLength).toBeGreaterThan(1);
    expect(recorded.elapsedMs).toBeGreaterThan(0);
    expect(recorded.rows.every((row) => row.acceptedAttempt >= 0)).toBe(true);
  });
});
