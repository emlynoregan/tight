import { createAcceptedWorldCache, getAcceptedWorld, summarizeAcceptedWorld, type AcceptedWorldSummary } from "./accepted-world";

export interface SeedSweepRow extends AcceptedWorldSummary {
  readonly ok: true;
  readonly elapsedMs: number;
}

export interface SeedSweepFailure {
  readonly ok: false;
  readonly seed: string;
  readonly code: string;
  readonly message: string;
  readonly elapsedMs: number;
}

export interface SeedSweepReport {
  readonly version: string;
  readonly seedCount: number;
  readonly accepted: number;
  readonly failed: readonly SeedSweepFailure[];
  readonly rows: readonly SeedSweepRow[];
  readonly attemptHistogram: Readonly<Record<number, number>>;
  readonly rejectCodeCounts: Readonly<Record<string, number>>;
  readonly witnessTypeCounts: Readonly<Record<string, number>>;
  readonly meanWitnessLength: number;
  readonly meanPreflightPlanes: number;
  readonly meanRepairCount: number;
  readonly meanRejectedAttempts: number;
  readonly elapsedMs: number;
  readonly meanMsPerSeed: number;
}

export function deterministicSweepSeeds(count: number, prefix = "sweep"): string[] {
  return Array.from({ length: count }, (_, index) => (index < 2 ? String(index) : `${prefix}-${index}`));
}

export function sweepAcceptedWorlds(
  seeds: readonly string[],
  version = "tight-v1",
  options: { readonly maxAttempts?: number } = {},
): SeedSweepReport {
  const cache = createAcceptedWorldCache();
  const rows: SeedSweepRow[] = [];
  const failed: SeedSweepFailure[] = [];
  const attemptHistogram: Record<number, number> = {};
  const rejectCodeCounts: Record<string, number> = {};
  const witnessTypeCounts: Record<string, number> = {};
  let repairTotal = 0;
  let preflightTotal = 0;
  let witnessTotal = 0;
  let rejectedAttemptTotal = 0;
  const started = Date.now();

  for (const seed of seeds) {
    const seedStarted = Date.now();
    const request = options.maxAttempts === undefined ? { cache } : { cache, maxAttempts: options.maxAttempts };
    const result = getAcceptedWorld(version, seed, request);
    const elapsedMs = Date.now() - seedStarted;
    if (!result.ok) {
      failed.push({ ok: false, seed, code: result.code, message: result.message, elapsedMs });
      for (const rejected of result.rejectedAttempts) {
        rejectCodeCounts[rejected.code] = (rejectCodeCounts[rejected.code] ?? 0) + 1;
      }
      continue;
    }
    const summary = summarizeAcceptedWorld(result);
    rows.push({ ...summary, ok: true, elapsedMs });
    attemptHistogram[result.acceptedAttempt] = (attemptHistogram[result.acceptedAttempt] ?? 0) + 1;
    witnessTotal += result.witness.length;
    preflightTotal += result.preflight.planes.length;
    repairTotal += result.preflight.planes.reduce((sum, plane) => sum + plane.repairCount, 0);
    rejectedAttemptTotal += result.rejectedAttempts.length;
    for (const rejected of result.rejectedAttempts) {
      rejectCodeCounts[rejected.code] = (rejectCodeCounts[rejected.code] ?? 0) + 1;
    }
    for (const type of summary.witnessTypes) {
      witnessTypeCounts[type] = (witnessTypeCounts[type] ?? 0) + 1;
    }
  }

  const accepted = rows.length;
  const elapsedMs = Date.now() - started;
  return {
    version,
    seedCount: seeds.length,
    accepted,
    failed,
    rows,
    attemptHistogram,
    rejectCodeCounts,
    witnessTypeCounts,
    meanWitnessLength: accepted === 0 ? 0 : witnessTotal / accepted,
    meanPreflightPlanes: accepted === 0 ? 0 : preflightTotal / accepted,
    meanRepairCount: accepted === 0 ? 0 : repairTotal / accepted,
    meanRejectedAttempts: accepted === 0 ? 0 : rejectedAttemptTotal / accepted,
    elapsedMs,
    meanMsPerSeed: seeds.length === 0 ? 0 : elapsedMs / seeds.length,
  };
}
