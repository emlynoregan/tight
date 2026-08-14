import { CONTENT_REGISTRY, GLOBAL_CONSTANTS, OLYMPUS_PLANE, planeKey, STARTING_PLANE } from "../../src/core";
import type { WorldTopology } from "../../src/core";
import type { ProgressionSource, TopologyGate, TopologyTransition } from "../../src/core/generation/topology-types";

interface RefState {
  planes: Set<string>;
  resources: Map<string, number>;
  flags: Set<string>;
  collected: Set<string>;
  unlocked: Set<string>;
}

function parseToken(token: string): { kind: string; value: string } | null {
  const split = token.indexOf(":");
  if (split <= 0 || split === token.length - 1) {
    return null;
  }
  return { kind: token.slice(0, split), value: token.slice(split + 1) };
}

function stackSize(resourceId: string): number {
  const size = CONTENT_REGISTRY.byId.item.get(resourceId)?.stackSize ?? GLOBAL_CONSTANTS.defaultStackSize;
  return size > 0 ? size : 1;
}

function occupiedSlots(resources: Map<string, number>): number {
  let slots = 0;
  for (const [resourceId, quantity] of resources) {
    if (quantity > 0) {
      slots += Math.ceil(quantity / stackSize(resourceId));
    }
  }
  return slots;
}

function addResource(resources: Map<string, number>, resourceId: string, amount: number): void {
  const next = (resources.get(resourceId) ?? 0) + amount;
  if (next <= 0) {
    resources.delete(resourceId);
  } else {
    resources.set(resourceId, next);
  }
}

function cloneResources(resources: Map<string, number>): Map<string, number> {
  return new Map(resources);
}

function stateKey(state: RefState): string {
  const resources = [...state.resources.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join(",");
  const sets = [state.planes, state.flags, state.collected, state.unlocked].map((set) => [...set].sort().join(","));
  return `${sets.join("|")}|${resources}`;
}

function cloneState(state: RefState): RefState {
  return {
    planes: new Set(state.planes),
    resources: cloneResources(state.resources),
    flags: new Set(state.flags),
    collected: new Set(state.collected),
    unlocked: new Set(state.unlocked),
  };
}

function occupiesInventory(source: ProgressionSource): boolean {
  return source.grants.some((grant) => {
    const token = parseToken(grant);
    if (token?.kind === "resource") {
      return true;
    }
    return token?.kind === "item" && CONTENT_REGISTRY.byId.item.get(token.value)?.kind === "resource";
  });
}

function applyGrants(state: RefState, source: ProgressionSource): void {
  for (const grant of source.grants) {
    const token = parseToken(grant);
    if (!token) {
      continue;
    }
    if (token.kind === "flag") {
      state.flags.add(token.value);
    } else if (token.kind === "resource") {
      addResource(state.resources, token.value, source.quantity);
    } else if (token.kind === "item" && CONTENT_REGISTRY.byId.item.get(token.value)?.kind === "resource") {
      addResource(state.resources, token.value, source.quantity);
    }
  }
}

function gateReady(state: RefState, gate: TopologyGate): boolean {
  if (gate.requiredFlag && !state.flags.has(gate.requiredFlag)) {
    return false;
  }
  if (gate.progressionClass === "resource_gate") {
    const have = gate.requiredResourceId ? (state.resources.get(gate.requiredResourceId) ?? 0) : 0;
    return have >= (gate.requiredQuantity ?? 0);
  }
  return true;
}

function transitionUsable(state: RefState, transition: TopologyTransition): boolean {
  if (transition.initiallyBroken || transition.progressionClass === "optional_broken") {
    return false;
  }
  if (!state.planes.has(planeKey(transition.sourcePlane))) {
    return false;
  }
  if (!transition.gateId) {
    return transition.progressionClass === "open";
  }
  return state.unlocked.has(transition.gateId);
}

function closure(state: RefState, topology: WorldTopology): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const gate of topology.gates) {
      if (gate.progressionClass === "resource_gate" || state.unlocked.has(gate.id)) {
        continue;
      }
      if (!gateReady(state, gate)) {
        continue;
      }
      state.unlocked.add(gate.id);
      changed = true;
    }
    for (const transition of topology.transitions) {
      if (!transitionUsable(state, transition)) {
        continue;
      }
      const dest = planeKey(transition.destinationPlane);
      if (!state.planes.has(dest)) {
        state.planes.add(dest);
        changed = true;
      }
    }
    for (const source of topology.progressionSources) {
      if (occupiesInventory(source) || state.collected.has(source.id) || source.consumption) {
        continue;
      }
      if (!state.planes.has(planeKey(source.plane))) {
        continue;
      }
      state.collected.add(source.id);
      applyGrants(state, source);
      changed = true;
    }
  }
}

function outstandingCost(topology: WorldTopology, state: RefState, resourceId: string): number {
  let cost = 0;
  for (const gate of topology.gates) {
    if (gate.progressionClass !== "resource_gate" || gate.requiredResourceId !== resourceId || state.unlocked.has(gate.id)) {
      continue;
    }
    cost += gate.requiredQuantity ?? 0;
  }
  return cost;
}

function capResources(state: RefState, topology: WorldTopology): void {
  for (const [resourceId, quantity] of [...state.resources]) {
    const capped = Math.min(quantity, outstandingCost(topology, state, resourceId));
    if (capped <= 0) {
      state.resources.delete(resourceId);
    } else {
      state.resources.set(resourceId, capped);
    }
  }
}

function retainChoices(resourceId: string, have: number, needed: number): number[] {
  const choices = new Set<number>([0, have]);
  if (needed > 0 && needed < have) {
    choices.add(needed);
  }
  const stack = stackSize(resourceId);
  const maxSlots = Math.ceil(have / stack);
  for (let slots = 1; slots < maxSlots; slots += 1) {
    choices.add(slots * stack);
    choices.add((slots - 1) * stack + 1);
  }
  return [...choices].filter((quantity) => quantity >= 0 && quantity <= have).sort((left, right) => left - right);
}

function unitRetainVariants(resources: Map<string, number>, topology: WorldTopology, state: RefState): Map<string, number>[] {
  const ids = [...resources.keys()].sort();
  const variants: Map<string, number>[] = [];
  const walk = (index: number, acc: Map<string, number>): void => {
    if (index >= ids.length) {
      variants.push(new Map(acc));
      return;
    }
    const resourceId = ids[index]!;
    for (const keep of retainChoices(resourceId, resources.get(resourceId) ?? 0, outstandingCost(topology, state, resourceId))) {
      const next = new Map(acc);
      if (keep > 0) {
        next.set(resourceId, keep);
      }
      walk(index + 1, next);
    }
  };
  walk(0, new Map());
  return variants;
}

function collectVariants(state: RefState, source: ProgressionSource, topology: WorldTopology): RefState[] {
  const withoutPickup = cloneState(state);
  withoutPickup.collected.add(source.id);
  const afterPickup = cloneState(withoutPickup);
  applyGrants(afterPickup, source);
  if (occupiedSlots(afterPickup.resources) <= GLOBAL_CONSTANTS.ordinaryInventorySlots) {
    return [afterPickup];
  }
  const variants: RefState[] = [];
  for (const retained of unitRetainVariants(state.resources, topology, state)) {
    const next = cloneState(withoutPickup);
    next.resources = cloneResources(retained);
    applyGrants(next, source);
    if (occupiedSlots(next.resources) <= GLOBAL_CONSTANTS.ordinaryInventorySlots) {
      variants.push(next);
    }
  }
  return variants;
}

/**
 * Tiny-graph inventory reference: exhaustive retained-quantity search before pickups.
 * Intentionally does not use the production discard-combination generator.
 */
export function exhaustiveInventoryReferenceWins(topology: WorldTopology): boolean {
  const start: RefState = {
    planes: new Set([planeKey(STARTING_PLANE)]),
    resources: new Map(),
    flags: new Set(),
    collected: new Set(),
    unlocked: new Set(),
  };
  closure(start, topology);
  capResources(start, topology);
  const queue = [start];
  const seen = new Set([stateKey(start)]);
  const olympus = planeKey(OLYMPUS_PLANE);
  let head = 0;
  while (head < queue.length) {
    const state = queue[head]!;
    head += 1;
    if (state.planes.has(olympus)) {
      return true;
    }
    for (const gate of topology.gates) {
      if (gate.progressionClass !== "resource_gate" || state.unlocked.has(gate.id)) {
        continue;
      }
      const transition = topology.transitions.find((row) => row.id === gate.transitionId);
      if (!transition || !state.planes.has(planeKey(transition.sourcePlane)) || !gateReady(state, gate)) {
        continue;
      }
      const resourceId = gate.requiredResourceId;
      const quantity = gate.requiredQuantity ?? 0;
      if (!resourceId || quantity <= 0) {
        continue;
      }
      const next = cloneState(state);
      addResource(next.resources, resourceId, -quantity);
      next.unlocked.add(gate.id);
      closure(next, topology);
      capResources(next, topology);
      const key = stateKey(next);
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
    for (const source of topology.progressionSources) {
      if (!occupiesInventory(source) || state.collected.has(source.id) || source.consumption) {
        continue;
      }
      if (!state.planes.has(planeKey(source.plane))) {
        continue;
      }
      for (const variant of collectVariants(state, source, topology)) {
        closure(variant, topology);
        capResources(variant, topology);
        const key = stateKey(variant);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(variant);
        }
      }
    }
  }
  return false;
}
