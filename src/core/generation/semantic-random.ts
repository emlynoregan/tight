import type { PlanePair, MapCoordinate } from "../model/plane";
import { canonicalizePlane } from "../model/plane";
import { bytesToHex, sha256 } from "./sha256";

export type SemanticPart =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "i64"; readonly value: bigint }
  | { readonly kind: "u64"; readonly value: bigint }
  | { readonly kind: "plane"; readonly value: PlanePair }
  | { readonly kind: "coord"; readonly value: MapCoordinate }
  | { readonly kind: "bool"; readonly value: boolean };

export const semantic = {
  string: (value: string): SemanticPart => ({ kind: "string", value }),
  i64: (value: number | bigint): SemanticPart => ({ kind: "i64", value: BigInt(value) }),
  u64: (value: number | bigint): SemanticPart => ({ kind: "u64", value: BigInt(value) }),
  plane: (value: PlanePair): SemanticPart => ({ kind: "plane", value: canonicalizePlane(value.a, value.b) }),
  coord: (value: MapCoordinate): SemanticPart => ({ kind: "coord", value }),
  bool: (value: boolean): SemanticPart => ({ kind: "bool", value }),
};

const TWO_64 = 1n << 64n;
const TWO_63 = 1n << 63n;

function appendBytes(chunks: Uint8Array[], type: number, payload: Uint8Array): void {
  const header = new Uint8Array(5);
  header[0] = type;
  const view = new DataView(header.buffer);
  view.setUint32(1, payload.length, false);
  chunks.push(header, payload);
}

function encodeI64(value: bigint): Uint8Array {
  let bits = value;
  if (bits < 0n) {
    bits = TWO_64 + bits;
  }
  if (bits < 0n || bits >= TWO_64) {
    throw new Error(`i64 out of range: ${value}`);
  }
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Number(bits >> 32n), false);
  view.setUint32(4, Number(bits & 0xffffffffn), false);
  return bytes;
}

function encodeU64(value: bigint): Uint8Array {
  if (value < 0n || value >= TWO_64) {
    throw new Error(`u64 out of range: ${value}`);
  }
  return encodeI64(value);
}

export function encodeSemanticKey(parts: readonly SemanticPart[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for (const part of parts) {
    switch (part.kind) {
      case "string":
        appendBytes(chunks, 0x01, encoder.encode(part.value));
        break;
      case "i64":
        if (part.value < -TWO_63 || part.value >= TWO_63) {
          throw new Error(`i64 out of range: ${part.value}`);
        }
        appendBytes(chunks, 0x02, encodeI64(part.value));
        break;
      case "u64":
        appendBytes(chunks, 0x03, encodeU64(part.value));
        break;
      case "plane": {
        const plane = canonicalizePlane(part.value.a, part.value.b);
        appendBytes(chunks, 0x04, Uint8Array.of(plane.a, plane.b));
        break;
      }
      case "coord":
        appendBytes(chunks, 0x05, Uint8Array.of(part.value.x, part.value.y));
        break;
      case "bool":
        appendBytes(chunks, 0x06, Uint8Array.of(part.value ? 1 : 0));
        break;
    }
  }
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }
  const key = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    key.set(chunk, offset);
    offset += chunk.length;
  }
  return key;
}

export function semanticHash(parts: readonly SemanticPart[]): Uint8Array {
  return sha256(encodeSemanticKey(parts));
}

export function semanticHashHex(parts: readonly SemanticPart[]): string {
  return bytesToHex(semanticHash(parts));
}

export function randomUint64(parts: readonly SemanticPart[]): bigint {
  const digest = semanticHash(parts);
  let value = 0n;
  for (let i = 0; i < 8; i += 1) {
    value = (value << 8n) | BigInt(digest[i]!);
  }
  return value;
}

function withOrdinal(parts: readonly SemanticPart[], ordinal?: number): readonly SemanticPart[] {
  if (ordinal === undefined) {
    return parts;
  }
  return [...parts, semantic.i64(ordinal)];
}

/** Uniform integer in 0..bound-1 using rejection sampling. */
export function boundedUnit(parts: readonly SemanticPart[], bound: number): number {
  if (!Number.isInteger(bound) || bound <= 0) {
    throw new Error(`bound must be a positive integer, got ${bound}`);
  }
  const boundBig = BigInt(bound);
  const limit = TWO_64 - (TWO_64 % boundBig);
  let ordinal = 0;
  for (;;) {
    const x = randomUint64([...parts, semantic.i64(ordinal)]);
    ordinal += 1;
    if (x < limit) {
      return Number(x % boundBig);
    }
  }
}

export function boundedInt(
  parts: readonly SemanticPart[],
  minInclusive: number,
  maxInclusive: number,
  ordinal?: number,
): number {
  if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive) || maxInclusive < minInclusive) {
    throw new Error(`invalid boundedInt range ${minInclusive}..${maxInclusive}`);
  }
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + boundedUnit(withOrdinal(parts, ordinal), span);
}

export function percentile(parts: readonly SemanticPart[], ordinal?: number): number {
  return boundedUnit(withOrdinal(parts, ordinal), 100);
}

export function chance(parts: readonly SemanticPart[], percent: number, ordinal?: number): boolean {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error(`percent must be 0..100, got ${percent}`);
  }
  if (percent === 0) {
    return false;
  }
  if (percent === 100) {
    return true;
  }
  return percentile(parts, ordinal) < percent;
}

export interface WeightedEntry<T> {
  readonly id: string;
  readonly weight: number;
  readonly value: T;
}

function compareUtf8Lower(left: string, right: string): number {
  const encoder = new TextEncoder();
  const a = encoder.encode(left.toLowerCase());
  const b = encoder.encode(right.toLowerCase());
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return a[i]! - b[i]!;
    }
  }
  return a.length - b.length;
}

function sortedWeighted<T>(entries: readonly WeightedEntry<T>[]): WeightedEntry<T>[] {
  return [...entries].sort((left, right) => compareUtf8Lower(left.id, right.id));
}

function weightedChoiceEntry<T>(
  parts: readonly SemanticPart[],
  entries: readonly WeightedEntry<T>[],
  ordinal?: number,
): WeightedEntry<T> {
  const eligible = sortedWeighted(entries).filter((entry) => entry.weight > 0);
  const total = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    throw new Error("weightedChoice requires a positive total weight");
  }
  let remaining = boundedUnit(withOrdinal(parts, ordinal), total);
  for (const entry of eligible) {
    if (remaining < entry.weight) {
      return entry;
    }
    remaining -= entry.weight;
  }
  throw new Error("weightedChoice failed to select an entry");
}

export function weightedChoice<T>(
  parts: readonly SemanticPart[],
  entries: readonly WeightedEntry<T>[],
  ordinal?: number,
): T {
  return weightedChoiceEntry(parts, entries, ordinal).value;
}

export function weightedRank<T>(
  parts: readonly SemanticPart[],
  entries: readonly WeightedEntry<T>[],
): T[] {
  const remaining = sortedWeighted(entries).filter((entry) => entry.weight > 0);
  const ranked: T[] = [];
  let selectionOrdinal = 0;
  while (remaining.length > 0) {
    const chosen = weightedChoiceEntry(parts, remaining, selectionOrdinal);
    ranked.push(chosen.value);
    const removeAt = remaining.findIndex((entry) => entry.id === chosen.id);
    remaining.splice(removeAt, 1);
    selectionOrdinal += 1;
  }
  return ranked;
}

export function compareStableIds(left: string, right: string): number {
  return compareUtf8Lower(left, right);
}
