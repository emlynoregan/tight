import { planeKey } from "../model/plane";
import { compareStableIds } from "./semantic-random";
import { bytesToHex, sha256 } from "./sha256";
import type { WorldTopology } from "./topology-types";

export function sortByStableId<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => compareStableIds(left.id, right.id));
}

export function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareStableIds);
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = canonicalizeValue(record[key]);
    }
    return out;
  }
  return value;
}

export function canonicalizeTopology(topology: Omit<WorldTopology, "topologyHash">): Omit<WorldTopology, "topologyHash"> {
  return {
    ...topology,
    planeNodes: [...topology.planeNodes].sort((left, right) => compareStableIds(planeKey(left.plane), planeKey(right.plane))),
    transitions: sortByStableId(topology.transitions),
    gates: sortByStableId(topology.gates),
    progressionSources: sortByStableId(topology.progressionSources),
    guardianInstances: sortByStableId(topology.guardianInstances),
    questInstances: sortByStableId(topology.questInstances),
    npcInstances: sortByStableId(topology.npcInstances),
    shopInstances: sortByStableId(topology.shopInstances),
  };
}

export function hashTopology(topology: Omit<WorldTopology, "topologyHash">): string {
  const canonical = canonicalizeValue(canonicalizeTopology(topology));
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical))));
}
