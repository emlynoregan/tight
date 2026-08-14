import { CONTENT_REGISTRY } from "../data/registry";
import { GLOBAL_CONSTANTS } from "../model/constants";
import {
  OLYMPUS_PLANE,
  parsePlaneKey,
  planeKey,
  STARTING_PLANE,
  type PlanePair,
} from "../model/plane";
import { compareStableIds } from "./semantic-random";
import type {
  ProgressionSource,
  TopologyGate,
  TopologyTransition,
  WorldTopology,
} from "./topology-types";
import {
  CONSUMING_ACTION_ORDER,
  type SolverFailure,
  type SolverResult,
  type SolverSearchOptions,
  type SolverState,
  type UnsatisfiedGateSummary,
  type WitnessStep,
} from "./solver-types";

interface Token {
  readonly kind: string;
  readonly value: string;
}

interface ConsumingAction {
  readonly order: number;
  readonly id: string;
  readonly apply: (state: SolverState) => void;
}

function parseToken(token: string): Token | null {
  const split = token.indexOf(":");
  if (split <= 0 || split === token.length - 1) {
    return null;
  }
  return { kind: token.slice(0, split), value: token.slice(split + 1) };
}

function sortedIds(ids: Iterable<string>): string[] {
  return [...ids].sort(compareStableIds);
}

function cloneState(state: SolverState): SolverState {
  return {
    reachablePlanes: new Set(state.reachablePlanes),
    discoveredDimensions: new Set(state.discoveredDimensions),
    abilities: new Set(state.abilities),
    keyItems: new Set(state.keyItems),
    equipmentCapabilities: new Set(state.equipmentCapabilities),
    resources: new Map(state.resources),
    currency: state.currency,
    flags: new Set(state.flags),
    defeatedGuardians: new Set(state.defeatedGuardians),
    collectedSources: new Set(state.collectedSources),
    completedQuests: new Set(state.completedQuests),
    purchasedStock: new Set(state.purchasedStock),
    unlockedGates: new Set(state.unlockedGates),
    witness: [...state.witness],
  };
}

function record(state: SolverState, step: WitnessStep): void {
  state.witness.push(step);
}

function resourceAmount(state: SolverState, resourceId: string): number {
  return state.resources.get(resourceId) ?? 0;
}

function addResource(state: SolverState, resourceId: string, amount: number): void {
  const next = resourceAmount(state, resourceId) + amount;
  if (next <= 0) {
    state.resources.delete(resourceId);
  } else {
    state.resources.set(resourceId, next);
  }
}

function itemKind(itemId: string): string | null {
  return CONTENT_REGISTRY.byId.item.get(itemId)?.kind ?? null;
}

function applyGrants(
  state: SolverState,
  grants: readonly string[],
  quantity: number,
  options?: { readonly skipInventory?: boolean },
): void {
  for (const grant of grants) {
    const token = parseToken(grant);
    if (!token) {
      continue;
    }
    if (token.kind === "flag") {
      if (!state.flags.has(token.value)) {
        state.flags.add(token.value);
      }
    } else if (token.kind === "ability") {
      if (!state.abilities.has(token.value)) {
        state.abilities.add(token.value);
        record(state, { type: "LEARN_ABILITY", id: token.value });
      }
    } else if (token.kind === "currency") {
      state.currency += Number(token.value) * (quantity > 0 ? 1 : 0);
    } else if (token.kind === "resource") {
      if (!options?.skipInventory) {
        addResource(state, token.value, quantity);
      }
    } else if (token.kind === "item") {
      const kind = itemKind(token.value);
      if (kind === "resource") {
        if (!options?.skipInventory) {
          addResource(state, token.value, quantity);
        }
      } else if (kind === "currency") {
        state.currency += quantity;
      } else {
        if (!state.keyItems.has(token.value)) {
          state.keyItems.add(token.value);
          if (kind === "key") {
            record(state, { type: "ACQUIRE_KEY", id: token.value });
          }
        }
        const item = CONTENT_REGISTRY.byId.item.get(token.value);
        if (item) {
          for (const abilityId of item.grantedAbilityIds) {
            if (!state.abilities.has(abilityId)) {
              state.abilities.add(abilityId);
              state.equipmentCapabilities.add(abilityId);
              record(state, { type: "LEARN_ABILITY", id: abilityId });
            }
          }
        }
      }
    }
  }
}

function requirementMet(state: SolverState, tokenText: string): boolean {
  const token = parseToken(tokenText);
  if (!token) {
    return false;
  }
  switch (token.kind) {
    case "flag":
      return state.flags.has(token.value);
    case "ability":
      return state.abilities.has(token.value);
    case "item":
      return state.keyItems.has(token.value) || resourceAmount(state, token.value) > 0;
    case "resource":
      return resourceAmount(state, token.value) >= 1;
    case "currency":
      return state.currency >= Number(token.value);
    case "dimension":
      return state.discoveredDimensions.has(Number(token.value));
    default:
      return false;
  }
}

function allRequirementsMet(state: SolverState, requirements: readonly string[]): boolean {
  return requirements.every((token) => requirementMet(state, token));
}

function isConsumingSource(source: ProgressionSource): boolean {
  if (source.sourceType === "shop_stock" && (source.price ?? 0) > 0) {
    return true;
  }
  if (!source.consumption) {
    return false;
  }
  return source.requirements.some((token) => {
    const parsed = parseToken(token);
    return parsed?.kind === "currency" || parsed?.kind === "resource";
  });
}

function planeReachable(state: SolverState, plane: PlanePair): boolean {
  return state.reachablePlanes.has(planeKey(plane));
}

function gateNonResourceReady(state: SolverState, gate: TopologyGate): boolean {
  if (gate.requiredFlag && !state.flags.has(gate.requiredFlag)) {
    return false;
  }
  if (gate.requiredItemId && !state.keyItems.has(gate.requiredItemId)) {
    return false;
  }
  if (gate.requiredAbilityId && !state.abilities.has(gate.requiredAbilityId)) {
    return false;
  }
  return true;
}

function outstandingResourceCost(topology: WorldTopology, state: SolverState, resourceId: string): number {
  let cost = 0;
  for (const gate of topology.gates) {
    if (gate.progressionClass !== "resource_gate" || gate.requiredResourceId !== resourceId) {
      continue;
    }
    if (state.unlockedGates.has(gate.id)) {
      continue;
    }
    cost += gate.requiredQuantity ?? 0;
  }
  for (const source of topology.progressionSources) {
    if (!isConsumingSource(source) || state.collectedSources.has(source.id) || state.purchasedStock.has(source.id)) {
      continue;
    }
    for (const tokenText of source.requirements) {
      const token = parseToken(tokenText);
      if (token?.kind === "resource" && token.value === resourceId) {
        cost += source.quantity;
      }
    }
  }
  return cost;
}

function outstandingCurrencyCost(topology: WorldTopology, state: SolverState): number {
  let cost = 0;
  for (const source of topology.progressionSources) {
    if (source.sourceType !== "shop_stock" || source.unlimited) {
      continue;
    }
    if (state.purchasedStock.has(source.id) || state.collectedSources.has(source.id)) {
      continue;
    }
    cost += source.price ?? 0;
  }
  return cost;
}

function resourceStackSize(resourceId: string): number {
  const item = CONTENT_REGISTRY.byId.item.get(resourceId);
  const size = item?.stackSize ?? GLOBAL_CONSTANTS.defaultStackSize;
  return size > 0 ? size : 1;
}

function occupiedSlots(state: SolverState): number {
  let slots = 0;
  for (const [resourceId, quantity] of state.resources) {
    if (quantity <= 0) {
      continue;
    }
    slots += Math.ceil(quantity / resourceStackSize(resourceId));
  }
  return slots;
}

function grantedResources(source: ProgressionSource): { id: string; amount: number }[] {
  const granted: { id: string; amount: number }[] = [];
  for (const grant of source.grants) {
    const token = parseToken(grant);
    if (!token) {
      continue;
    }
    if (token.kind === "resource") {
      granted.push({ id: token.value, amount: source.quantity });
    } else if (token.kind === "item" && itemKind(token.value) === "resource") {
      granted.push({ id: token.value, amount: source.quantity });
    }
  }
  return granted;
}

function occupiesInventorySlots(source: ProgressionSource): boolean {
  return grantedResources(source).length > 0;
}

function minDropToFreeSlots(resourceId: string, have: number, slotsNeeded: number): number | null {
  if (have <= 0 || slotsNeeded <= 0) {
    return null;
  }
  const stack = resourceStackSize(resourceId);
  const currentSlots = Math.ceil(have / stack);
  const targetSlots = currentSlots - slotsNeeded;
  if (targetSlots <= 0) {
    return have;
  }
  const maxKeep = targetSlots * stack;
  const drop = have - maxKeep;
  return drop > 0 ? drop : null;
}

function collectUseful(topology: WorldTopology, state: SolverState, source: ProgressionSource): boolean {
  for (const granted of grantedResources(source)) {
    if (resourceAmount(state, granted.id) < outstandingResourceCost(topology, state, granted.id)) {
      return true;
    }
  }
  return source.grants.some((grant) => {
    const token = parseToken(grant);
    return token?.kind === "flag" || token?.kind === "ability" || (token?.kind === "item" && itemKind(token.value) !== "resource");
  });
}

function guardianIdFromSource(sourceId: string): string | null {
  const prefix = "source.guardian_reward.";
  return sourceId.startsWith(prefix) ? sourceId.slice(prefix.length) : null;
}

function questIdFromSource(sourceId: string): string | null {
  const prefix = "source.quest_reward.";
  return sourceId.startsWith(prefix) ? sourceId.slice(prefix.length) : null;
}

function resourcePickupReady(state: SolverState, source: ProgressionSource, topology: WorldTopology): boolean {
  if (!occupiesInventorySlots(source) || !collectUseful(topology, state, source)) {
    return false;
  }
  if (isConsumingSource(source) || state.collectedSources.has(source.id) || state.purchasedStock.has(source.id)) {
    return false;
  }
  if (!planeReachable(state, source.plane) || !allRequirementsMet(state, source.requirements)) {
    return false;
  }
  if (source.sourceType === "guardian_reward") {
    const guardianId = guardianIdFromSource(source.id);
    return guardianId !== null && state.defeatedGuardians.has(guardianId);
  }
  if (source.sourceType === "quest_reward") {
    const questId = questIdFromSource(source.id);
    return questId !== null && state.completedQuests.has(questId);
  }
  return true;
}

function greedyDiscardPlan(state: SolverState, overflow: number): Map<string, number> | null {
  const drops = new Map<string, number>();
  let remaining = overflow;
  for (const resourceId of sortedIds(state.resources.keys())) {
    const have = resourceAmount(state, resourceId);
    const drop = minDropToFreeSlots(resourceId, have, remaining);
    if (drop == null) {
      continue;
    }
    const stack = resourceStackSize(resourceId);
    const freed = Math.ceil(have / stack) - Math.ceil((have - drop) / stack);
    drops.set(resourceId, drop);
    remaining -= freed;
    if (remaining <= 0) {
      return drops;
    }
  }
  return remaining <= 0 ? drops : null;
}

function annotateDiscard(state: SolverState, detail: string): void {
  const last = state.witness.at(-1);
  if (!last) {
    return;
  }
  state.witness[state.witness.length - 1] = {
    ...last,
    detail: last.detail ? `${last.detail}|${detail}` : detail,
  };
}

function expandForInventory(state: SolverState, action: ConsumingAction): ConsumingAction[] {
  const preview = cloneState(state);
  action.apply(preview);
  const overflow = occupiedSlots(preview) - GLOBAL_CONSTANTS.ordinaryInventorySlots;
  if (overflow <= 0) {
    return [action];
  }
  const expanded: ConsumingAction[] = [];
  for (const resourceId of sortedIds(state.resources.keys())) {
    const drop = minDropToFreeSlots(resourceId, resourceAmount(state, resourceId), overflow);
    if (drop == null) {
      continue;
    }
    const trial = cloneState(state);
    addResource(trial, resourceId, -drop);
    action.apply(trial);
    if (!inventoryFeasible(trial)) {
      continue;
    }
    const discardDetail = `discard ${resourceId}:${drop}`;
    expanded.push({
      order: action.order,
      id: `${action.id}|discard:${resourceId}:${drop}`,
      apply(next) {
        addResource(next, resourceId, -drop);
        action.apply(next);
        annotateDiscard(next, discardDetail);
      },
    });
  }
  const greedy = greedyDiscardPlan(state, overflow);
  if (greedy && greedy.size > 1) {
    const trial = cloneState(state);
    for (const [resourceId, drop] of greedy) {
      addResource(trial, resourceId, -drop);
    }
    action.apply(trial);
    if (inventoryFeasible(trial)) {
      const spec = [...greedy.entries()]
        .sort((left, right) => compareStableIds(left[0], right[0]))
        .map(([resourceId, drop]) => `${resourceId}:${drop}`)
        .join(",");
      const discardDetail = `discard ${spec}`;
      expanded.push({
        order: action.order,
        id: `${action.id}|discard:${spec}`,
        apply(next) {
          for (const [resourceId, drop] of greedy) {
            addResource(next, resourceId, -drop);
          }
          action.apply(next);
          annotateDiscard(next, discardDetail);
        },
      });
    }
  }
  return expanded;
}

function searchKey(state: SolverState): string {
  const resources = sortedIds(state.resources.keys())
    .map((id) => `${id}:${resourceAmount(state, id)}`)
    .join(",");
  return `${factSignature(state)}|${state.currency}|${resources}`;
}

export function canonicalizeSolverState(topology: WorldTopology, state: SolverState): SolverState {
  const next = cloneState(state);
  for (const [resourceId, quantity] of [...next.resources]) {
    const ceiling = outstandingResourceCost(topology, next, resourceId);
    const capped = Math.min(quantity, ceiling);
    if (capped <= 0) {
      next.resources.delete(resourceId);
    } else {
      next.resources.set(resourceId, capped);
    }
  }
  const currencyCeiling = outstandingCurrencyCost(topology, next);
  next.currency = Math.min(next.currency, currencyCeiling);
  return next;
}

function inventoryFeasible(state: SolverState): boolean {
  return occupiedSlots(state) <= GLOBAL_CONSTANTS.ordinaryInventorySlots;
}

function factSignature(state: SolverState): string {
  return [
    sortedIds(state.reachablePlanes).join(","),
    [...state.discoveredDimensions].sort((left, right) => left - right).join(","),
    sortedIds(state.abilities).join(","),
    sortedIds(state.keyItems).join(","),
    sortedIds(state.equipmentCapabilities).join(","),
    sortedIds(state.flags).join(","),
    sortedIds(state.defeatedGuardians).join(","),
    sortedIds(state.collectedSources).join(","),
    sortedIds(state.completedQuests).join(","),
    sortedIds(state.purchasedStock).join(","),
    sortedIds(state.unlockedGates).join(","),
  ].join("|");
}

export function dominates(left: SolverState, right: SolverState): boolean {
  if (factSignature(left) !== factSignature(right)) {
    return false;
  }
  if (left.currency < right.currency) {
    return false;
  }
  if (occupiedSlots(left) > occupiedSlots(right)) {
    return false;
  }
  const ids = new Set([...left.resources.keys(), ...right.resources.keys()]);
  for (const id of ids) {
    if (resourceAmount(left, id) < resourceAmount(right, id)) {
      return false;
    }
  }
  return true;
}

function discoverDimensions(state: SolverState): boolean {
  let changed = false;
  for (const key of sortedIds(state.reachablePlanes)) {
    const plane = parsePlaneKey(key);
    for (const dimension of [plane.a, plane.b]) {
      if (!state.discoveredDimensions.has(dimension)) {
        state.discoveredDimensions.add(dimension);
        record(state, { type: "DISCOVER_DIMENSION", detail: String(dimension) });
        changed = true;
      }
    }
  }
  return changed;
}

function collectFreeSources(state: SolverState, topology: WorldTopology): boolean {
  let changed = false;
  const sources = [...topology.progressionSources].sort((left, right) => compareStableIds(left.id, right.id));
  for (const source of sources) {
    if (isConsumingSource(source) || state.collectedSources.has(source.id) || state.purchasedStock.has(source.id)) {
      continue;
    }
    if (source.sourceType === "guardian_reward" || source.sourceType === "quest_reward") {
      continue;
    }
    if (occupiesInventorySlots(source)) {
      continue;
    }
    if (!planeReachable(state, source.plane) || !allRequirementsMet(state, source.requirements)) {
      continue;
    }
    state.collectedSources.add(source.id);
    record(state, { type: "COLLECT_SOURCE", id: source.id, plane: source.plane });
    applyGrants(state, source.grants, source.quantity);
    changed = true;
  }
  return changed;
}

function defeatReachableGuardians(state: SolverState, topology: WorldTopology): boolean {
  let changed = false;
  const guardians = [...topology.guardianInstances].sort((left, right) => compareStableIds(left.id, right.id));
  for (const guardian of guardians) {
    if (state.defeatedGuardians.has(guardian.id) || !planeReachable(state, guardian.plane)) {
      continue;
    }
    state.defeatedGuardians.add(guardian.id);
    record(state, { type: "DEFEAT_GUARDIAN", id: guardian.id, plane: guardian.plane });
    const rewardId = `source.guardian_reward.${guardian.id}`;
    const source = topology.progressionSources.find((row) => row.id === rewardId);
    if (source && !state.collectedSources.has(source.id)) {
      if (occupiesInventorySlots(source)) {
        applyGrants(state, source.grants, source.quantity, { skipInventory: true });
      } else {
        state.collectedSources.add(source.id);
        applyGrants(state, source.grants, source.quantity);
      }
    }
    changed = true;
  }
  return changed;
}

function completeMonotoneQuests(state: SolverState, topology: WorldTopology): boolean {
  let changed = false;
  const quests = [...topology.questInstances].sort((left, right) => compareStableIds(left.id, right.id));
  for (const quest of quests) {
    if (state.completedQuests.has(quest.id) || !planeReachable(state, quest.plane)) {
      continue;
    }
    const source = topology.progressionSources.find((row) => row.id === `source.quest_reward.${quest.id}`);
    if (!source || isConsumingSource(source)) {
      continue;
    }
    if (!allRequirementsMet(state, source.requirements)) {
      continue;
    }
    state.completedQuests.add(quest.id);
    record(state, { type: "COMPLETE_QUEST", id: quest.id, plane: quest.plane });
    if (occupiesInventorySlots(source)) {
      applyGrants(state, source.grants, source.quantity, { skipInventory: true });
    } else {
      state.collectedSources.add(source.id);
      applyGrants(state, source.grants, source.quantity);
    }
    changed = true;
  }
  return changed;
}

function unlockNonConsumingGates(state: SolverState, topology: WorldTopology): boolean {
  let changed = false;
  const gates = [...topology.gates].sort((left, right) => compareStableIds(left.id, right.id));
  for (const gate of gates) {
    if (gate.progressionClass === "resource_gate" || state.unlockedGates.has(gate.id)) {
      continue;
    }
    if (!gateNonResourceReady(state, gate)) {
      continue;
    }
    state.unlockedGates.add(gate.id);
    record(state, { type: "UNLOCK_GATE", id: gate.id });
    changed = true;
  }
  return changed;
}

function transitionUsable(state: SolverState, transition: TopologyTransition): boolean {
  if (transition.initiallyBroken || transition.progressionClass === "optional_broken") {
    return false;
  }
  if (!planeReachable(state, transition.sourcePlane)) {
    return false;
  }
  if (!transition.gateId) {
    return transition.progressionClass === "open";
  }
  return state.unlockedGates.has(transition.gateId);
}

function traverseUsableTransitions(state: SolverState, topology: WorldTopology): boolean {
  let changed = false;
  const transitions = [...topology.transitions].sort((left, right) => compareStableIds(left.id, right.id));
  for (const transition of transitions) {
    if (!transitionUsable(state, transition)) {
      continue;
    }
    const dest = planeKey(transition.destinationPlane);
    if (state.reachablePlanes.has(dest)) {
      continue;
    }
    state.reachablePlanes.add(dest);
    record(state, { type: "TRAVERSE_TRANSITION", id: transition.id, plane: transition.destinationPlane });
    changed = true;
  }
  return changed;
}

function closure(state: SolverState, topology: WorldTopology): SolverState {
  let working = state;
  let changed = true;
  while (changed) {
    changed = false;
    changed = discoverDimensions(working) || changed;
    changed = collectFreeSources(working, topology) || changed;
    changed = defeatReachableGuardians(working, topology) || changed;
    changed = completeMonotoneQuests(working, topology) || changed;
    changed = unlockNonConsumingGates(working, topology) || changed;
    changed = traverseUsableTransitions(working, topology) || changed;
  }
  return working;
}

function victory(state: SolverState, topology: WorldTopology): boolean {
  if (!planeReachable(state, OLYMPUS_PLANE)) {
    return false;
  }
  return topology.olympusBossInstance.encounterId === "boss_olympus";
}

function appendVictory(state: SolverState): void {
  record(state, { type: "REACH_OLYMPUS", plane: OLYMPUS_PLANE });
  record(state, { type: "FINAL_BOSS_AVAILABLE", id: "boss_olympus" });
}

function shopUseful(topology: WorldTopology, source: ProgressionSource): boolean {
  for (const grant of source.grants) {
    const token = parseToken(grant);
    if (!token) {
      continue;
    }
    if (token.kind === "ability" || token.kind === "flag") {
      return true;
    }
    if (token.kind === "item") {
      const kind = itemKind(token.value);
      if (kind === "key" || kind === "artefact") {
        return true;
      }
      if (topology.gates.some((gate) => gate.requiredItemId === token.value)) {
        return true;
      }
    }
    if (token.kind === "resource") {
      return true;
    }
  }
  return !source.unlimited;
}

function legalConsumingActions(state: SolverState, topology: WorldTopology): ConsumingAction[] {
  const actions: ConsumingAction[] = [];
  for (const gate of topology.gates) {
    if (gate.progressionClass !== "resource_gate" || state.unlockedGates.has(gate.id)) {
      continue;
    }
    const transition = topology.transitions.find((row) => row.id === gate.transitionId);
    if (!transition || !planeReachable(state, transition.sourcePlane) || !gateNonResourceReady(state, gate)) {
      continue;
    }
    const resourceId = gate.requiredResourceId;
    const quantity = gate.requiredQuantity ?? 0;
    if (!resourceId || quantity <= 0 || resourceAmount(state, resourceId) < quantity) {
      continue;
    }
    actions.push({
      order: CONSUMING_ACTION_ORDER.resource_gate,
      id: gate.id,
      apply(next) {
        addResource(next, resourceId, -quantity);
        next.unlockedGates.add(gate.id);
        record(next, { type: "UNLOCK_GATE", id: gate.id, detail: `${resourceId}:${quantity}` });
      },
    });
  }

  for (const quest of topology.questInstances) {
    if (state.completedQuests.has(quest.id) || !planeReachable(state, quest.plane)) {
      continue;
    }
    const source = topology.progressionSources.find((row) => row.id === `source.quest_reward.${quest.id}`);
    if (!source || !isConsumingSource(source) || !allRequirementsMet(state, source.requirements)) {
      continue;
    }
    actions.push({
      order: CONSUMING_ACTION_ORDER.consuming_quest,
      id: quest.id,
      apply(next) {
        payConsumingRequirements(next, source);
        next.completedQuests.add(quest.id);
        next.collectedSources.add(source.id);
        record(next, { type: "COMPLETE_QUEST", id: quest.id, plane: quest.plane });
        applyGrants(next, source.grants, source.quantity);
      },
    });
  }

  for (const source of topology.progressionSources) {
    if (source.sourceType !== "shop_stock") {
      continue;
    }
    if (!planeReachable(state, source.plane) || !shopUseful(topology, source)) {
      continue;
    }
    const price = source.price ?? 0;
    if (state.currency < price) {
      continue;
    }
    if (!source.unlimited && (state.purchasedStock.has(source.id) || state.collectedSources.has(source.id))) {
      continue;
    }
    if (source.unlimited) {
      const grantItem = source.grants.map(parseToken).find((token) => token?.kind === "item" || token?.kind === "resource");
      if (grantItem?.kind === "resource") {
        const ceiling = outstandingResourceCost(topology, state, grantItem.value);
        if (resourceAmount(state, grantItem.value) >= ceiling + 1) {
          continue;
        }
      } else if (!shopUseful(topology, source)) {
        continue;
      } else if (grantItem?.kind === "item" && state.keyItems.has(grantItem.value)) {
        continue;
      }
    }
    actions.push(
      ...expandForInventory(state, {
        order: CONSUMING_ACTION_ORDER.shop_purchase,
        id: source.id,
        apply(next) {
          next.currency -= price;
          if (!source.unlimited) {
            next.purchasedStock.add(source.id);
            next.collectedSources.add(source.id);
          }
          record(next, { type: "BUY_ITEM", id: source.id, detail: source.contentReference });
          applyGrants(next, source.grants, source.quantity);
        },
      }),
    );
  }

  for (const source of topology.progressionSources) {
    if (!resourcePickupReady(state, source, topology)) {
      continue;
    }
    actions.push(
      ...expandForInventory(state, {
        order: CONSUMING_ACTION_ORDER.collect_resource,
        id: source.id,
        apply(next) {
          next.collectedSources.add(source.id);
          record(next, { type: "COLLECT_SOURCE", id: source.id, plane: source.plane });
          applyGrants(next, source.grants, source.quantity);
        },
      }),
    );
  }

  actions.sort((left, right) => left.order - right.order || compareStableIds(left.id, right.id));
  return actions;
}

function payConsumingRequirements(state: SolverState, source: ProgressionSource): void {
  for (const tokenText of source.requirements) {
    const token = parseToken(tokenText);
    if (token?.kind === "currency") {
      state.currency -= Number(token.value);
    }
    if (token?.kind === "resource") {
      addResource(state, token.value, -source.quantity);
    }
  }
}

function initialState(): SolverState {
  return {
    reachablePlanes: new Set([planeKey(STARTING_PLANE)]),
    discoveredDimensions: new Set([0, 1]),
    abilities: new Set(CONTENT_REGISTRY.startingPlayerState.learnedAbilities),
    keyItems: new Set(),
    equipmentCapabilities: new Set(),
    resources: new Map(),
    currency: CONTENT_REGISTRY.startingLoadout.coin,
    flags: new Set(),
    defeatedGuardians: new Set(),
    collectedSources: new Set(),
    completedQuests: new Set(),
    purchasedStock: new Set(),
    unlockedGates: new Set(),
    witness: [{ type: "START", plane: STARTING_PLANE }],
  };
}

class DominanceFrontier {
  private readonly byFacts = new Map<string, SolverState[]>();

  add(state: SolverState): void {
    const key = factSignature(state);
    const bucket = this.byFacts.get(key) ?? [];
    bucket.push(state);
    this.byFacts.set(key, bucket);
  }

  isDominated(candidate: SolverState): boolean {
    const bucket = this.byFacts.get(factSignature(candidate));
    if (!bucket) {
      return false;
    }
    return bucket.some((existing) => dominates(existing, candidate));
  }

  removeDominatedBy(candidate: SolverState): void {
    const key = factSignature(candidate);
    const bucket = this.byFacts.get(key);
    if (!bucket) {
      return;
    }
    this.byFacts.set(
      key,
      bucket.filter((existing) => !dominates(candidate, existing) || sameResources(candidate, existing)),
    );
  }

  snapshots(): SolverState[] {
    return [...this.byFacts.values()].flat();
  }
}

function sameResources(left: SolverState, right: SolverState): boolean {
  if (left.currency !== right.currency) {
    return false;
  }
  const ids = new Set([...left.resources.keys(), ...right.resources.keys()]);
  for (const id of ids) {
    if (resourceAmount(left, id) !== resourceAmount(right, id)) {
      return false;
    }
  }
  return true;
}

function buildDiagnostics(frontier: DominanceFrontier, topology: WorldTopology): SolverFailure {
  const snapshots = frontier.snapshots();
  const best = snapshots.reduce((winner, row) => (row.reachablePlanes.size > winner.reachablePlanes.size ? row : winner), snapshots[0] ?? initialState());
  const reachable = best.reachablePlanes;
  const frontierTransitions: string[] = [];
  const unsatisfiedGateSummaries: UnsatisfiedGateSummary[] = [];
  for (const transition of topology.transitions) {
    if (!reachable.has(planeKey(transition.sourcePlane))) {
      continue;
    }
    if (reachable.has(planeKey(transition.destinationPlane))) {
      continue;
    }
    frontierTransitions.push(transition.id);
    if (!transition.gateId) {
      continue;
    }
    const gate = topology.gates.find((row) => row.id === transition.gateId);
    if (!gate) {
      unsatisfiedGateSummaries.push({
        gateId: transition.gateId,
        transitionId: transition.id,
        progressionClass: transition.progressionClass,
        reason: "missing gate object",
      });
      continue;
    }
    unsatisfiedGateSummaries.push({
      gateId: gate.id,
      transitionId: transition.id,
      progressionClass: gate.progressionClass,
      reason: unsatisfiedReason(best, topology, gate),
    });
  }
  const scarceResources = [...new Set(
    unsatisfiedGateSummaries
      .filter((row) => row.reason.startsWith("insufficient:"))
      .map((row) => row.reason.slice("insufficient:".length)),
  )].sort(compareStableIds);
  const unreachableProgressionSources = topology.progressionSources
    .filter((source) => !reachable.has(planeKey(source.plane)))
    .map((source) => source.id)
    .sort(compareStableIds);
  return {
    reachablePlaneCount: reachable.size,
    discoveredDimensions: [...best.discoveredDimensions].sort((left, right) => left - right),
    frontierTransitions: [...frontierTransitions].sort(compareStableIds),
    unsatisfiedGateSummaries,
    scarceResources,
    unreachableProgressionSources,
  };
}

function unsatisfiedReason(state: SolverState, topology: WorldTopology, gate: TopologyGate): string {
  if (gate.progressionClass === "resource_gate") {
    const have = gate.requiredResourceId ? resourceAmount(state, gate.requiredResourceId) : 0;
    const need = gate.requiredQuantity ?? 0;
    if (have < need) {
      return `insufficient:${gate.requiredResourceId ?? "resource"}`;
    }
  }
  if (gate.requiredItemId && !state.keyItems.has(gate.requiredItemId)) {
    const sourceExists = topology.progressionSources.some((source) => source.grants.includes(`item:${gate.requiredItemId}`));
    return sourceExists ? `missing key ${gate.requiredItemId}` : `missing key source ${gate.requiredItemId}`;
  }
  if (gate.requiredAbilityId && !state.abilities.has(gate.requiredAbilityId)) {
    return `missing ability ${gate.requiredAbilityId}`;
  }
  if (gate.requiredFlag && !state.flags.has(gate.requiredFlag)) {
    return `missing flag ${gate.requiredFlag}`;
  }
  if (gate.progressionClass === "resource_gate") {
    return "resource source behind own gate";
  }
  return "unsatisfied";
}

export function proveWinnable(topology: WorldTopology, options?: SolverSearchOptions): SolverResult {
  const prune = options?.prune !== false;
  let start = initialState();
  start = closure(start, topology);
  start = canonicalizeSolverState(topology, start);
  if (victory(start, topology) && inventoryFeasible(start)) {
    appendVictory(start);
    return { ok: true, witness: start.witness };
  }

  const queue: SolverState[] = [];
  const frontier = new DominanceFrontier();
  const seen = new Set<string>();
  if (inventoryFeasible(start)) {
    queue.push(start);
    frontier.add(start);
    seen.add(searchKey(start));
  }

  let head = 0;
  while (head < queue.length) {
    const state = queue[head]!;
    head += 1;
    if (victory(state, topology)) {
      appendVictory(state);
      return { ok: true, witness: state.witness };
    }
    for (const action of legalConsumingActions(state, topology)) {
      let next = cloneState(state);
      action.apply(next);
      next = closure(next, topology);
      next = canonicalizeSolverState(topology, next);
      if (!inventoryFeasible(next)) {
        continue;
      }
      if (victory(next, topology)) {
        appendVictory(next);
        return { ok: true, witness: next.witness };
      }
      const key = searchKey(next);
      if (seen.has(key)) {
        continue;
      }
      if (prune && frontier.isDominated(next)) {
        continue;
      }
      seen.add(key);
      if (prune) {
        frontier.removeDominatedBy(next);
      }
      frontier.add(next);
      queue.push(next);
    }
  }

  return { ok: false, failure: buildDiagnostics(frontier, topology) };
}
