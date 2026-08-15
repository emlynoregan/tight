import type { WitnessStep } from "../generation/solver-types";
import type { PlaneBase } from "../generation/plane-types";
import type { TopologyTransition } from "../generation/topology-types";
import { CONTENT_REGISTRY } from "../data/registry";
import { OLYMPUS_PLANE, planesEqual, type MapCoordinate, type PlanePair } from "../model/plane";
import { allCells, ORTHOGONAL } from "../generation/grid";
import { resolveAction } from "../rules/actions";
import { resolveDeaths } from "../rules/death";
import { actorAt, canOccupy, destinationCell, doorRuntimeState, featureAt, setFeatureRuntimeState } from "../rules/occupancy";
import { startQuest, questState, refreshQuestProgress } from "../rules/quests";
import { buyShopSource } from "../rules/shops";
import {
  activateTransition,
  arrivalCellFor,
  ensurePlaneLoaded,
  switchCurrentPlane,
  unlockGate,
} from "../rules/transitions";
import { materializeNonPlayerActors, playerActor, type GameRuntime } from "./game-runtime";
import type { TickEvent } from "../rules/tick-events";

export interface WitnessExecutionResult {
  readonly ok: boolean;
  readonly stepIndex: number;
  readonly events: readonly TickEvent[];
  readonly message?: string;
}

function fail(stepIndex: number, events: TickEvent[], message: string): WitnessExecutionResult {
  return { ok: false, stepIndex, events, message };
}

function failedAction(events: readonly TickEvent[]): boolean {
  return events.some((event) => event.type === "action_failed");
}

function approachCell(
  runtime: GameRuntime,
  target: MapCoordinate,
  preferOnCell: boolean,
): MapCoordinate | null {
  const plane = runtime.currentPlaneBase;
  const player = playerActor(runtime);
  const named = plane.namedPoints.find(
    (point) => point.kind === "approach" && Math.abs(point.x - target.x) + Math.abs(point.y - target.y) === 1,
  );
  if (named && canOccupy(plane, runtime.save.actors, named, player.id, runtime.save)) {
    return { x: named.x, y: named.y };
  }
  if (preferOnCell && canOccupy(plane, runtime.save.actors, target, player.id, runtime.save)) {
    return { x: target.x, y: target.y };
  }
  for (const delta of ORTHOGONAL) {
    const dest = destinationCell(target, delta, plane.wraps);
    if (dest && canOccupy(plane, runtime.save.actors, dest, player.id, runtime.save)) {
      return dest;
    }
  }
  if (canOccupy(plane, runtime.save.actors, target, player.id, runtime.save)) {
    return { x: target.x, y: target.y };
  }
  return null;
}

function movePlayerTo(runtime: GameRuntime, cell: MapCoordinate): void {
  const player = playerActor(runtime);
  player.plane = { ...runtime.save.plane };
  player.x = cell.x;
  player.y = cell.y;
}

function loadPlane(runtime: GameRuntime, plane: PlanePair): boolean {
  const loaded = switchCurrentPlane(runtime, plane);
  if (!loaded) {
    return false;
  }
  const player = playerActor(runtime);
  player.plane = { ...plane };
  return true;
}

function interactCell(runtime: GameRuntime, cell: MapCoordinate, events: TickEvent[]): TickEvent[] {
  const feature = featureAt(runtime.currentPlaneBase, cell);
  const action = feature
    ? { type: "interact" as const, targetId: feature, targetX: cell.x, targetY: cell.y }
    : { type: "interact" as const, targetX: cell.x, targetY: cell.y };
  const produced = resolveAction(runtime, playerActor(runtime), action);
  events.push(...produced);
  return produced;
}

function collectSource(runtime: GameRuntime, sourceId: string, events: TickEvent[]): string | null {
  const source =
    runtime.topology.progressionSources.find((row) => row.id === sourceId)
    ?? runtime.topology.progressionSources.find((row) => row.grants.includes(`item:${sourceId}`));
  if (!source) {
    return `missing source ${sourceId}`;
  }
  if (runtime.save.collectedSources.includes(source.id) || source.grants.every((grant) => {
    const token = grant.split(":");
    return token[0] === "ability" && runtime.save.player.learnedAbilities.includes(token[1] ?? "");
  })) {
    return null;
  }
  if (!loadPlane(runtime, source.plane)) {
    return `could not load ${source.id}`;
  }
  if (source.sourceType === "npc_teaching") {
    const npc =
      runtime.save.actors.find((row) => row.kind === "npc" && planesEqual(row.plane, source.plane) && row.definitionId !== "shopkeeper")
      ?? runtime.save.actors.find((row) => row.kind === "npc" && planesEqual(row.plane, source.plane));
    if (!npc) {
      return `missing teacher for ${source.id}`;
    }
    const stand = approachCell(runtime, npc, false);
    if (!stand) {
      return `no approach for ${source.id}`;
    }
    movePlayerTo(runtime, stand);
    const produced = resolveAction(runtime, playerActor(runtime), { type: "interact", targetId: npc.id });
    events.push(...produced);
    if (!runtime.save.collectedSources.includes(source.id) && source.grants.some((grant) => grant.startsWith("ability:") && !runtime.save.player.learnedAbilities.includes(grant.slice(8)))) {
      return `could not collect ${source.id}`;
    }
    return null;
  }
  const point =
    runtime.currentPlaneBase.namedPoints.find((row) => row.id === source.id)
    ?? runtime.currentPlaneBase.namedPoints.find((row) => row.id === `${source.id}.approach`);
  if (!point) {
    return `missing point for ${source.id}`;
  }
  const target = runtime.currentPlaneBase.namedPoints.find((row) => row.id === source.id) ?? point;
  const namedApproach = runtime.currentPlaneBase.namedPoints.find((row) => row.id === `${source.id}.approach`);
  const stand = namedApproach
    ? { x: namedApproach.x, y: namedApproach.y }
    : approachCell(runtime, target, false);
  if (!stand) {
    return `no approach for ${source.id}`;
  }
  movePlayerTo(runtime, stand);
  const produced = interactCell(runtime, target, events);
  if (failedAction(produced) && !runtime.save.collectedSources.includes(source.id)) {
    return `could not collect ${source.id}`;
  }
  return null;
}

function materializePlaneActors(runtime: GameRuntime, plane: PlanePair) {
  const loaded = ensurePlaneLoaded(runtime, plane);
  if (!loaded) {
    return null;
  }
  const known = new Set(runtime.save.actors.map((actor) => actor.id));
  const occupied = new Set(
    runtime.save.actors
      .filter((actor) => planesEqual(actor.plane, plane))
      .map((actor) => `${actor.y},${actor.x}`),
  );
  for (const actor of materializeNonPlayerActors(runtime.topology, loaded, occupied, runtime.save)) {
    if (!known.has(actor.id) && !runtime.save.flags.includes(`defeated:${actor.id}`)) {
      runtime.save.actors.push(actor);
    }
  }
  return loaded;
}

function freeLanding(runtime: GameRuntime, plane: PlaneBase, cell: MapCoordinate, moverId: string): void {
  const door = doorRuntimeState(runtime.save, plane, cell);
  if (door === "closed" || door === "locked") {
    setFeatureRuntimeState(runtime.save, plane.plane, cell, "open");
  }
  const occupant = actorAt(runtime.save.actors.filter((row) => planesEqual(row.plane, plane.plane)), cell, moverId);
  if (occupant?.blocking) {
    const spare = allCells().find(
      (candidate) =>
        (candidate.x !== cell.x || candidate.y !== cell.y)
        && canOccupy(plane, runtime.save.actors, candidate, occupant.id, runtime.save),
    );
    if (spare) {
      occupant.x = spare.x;
      occupant.y = spare.y;
    }
  }
}

function traverseTransition(runtime: GameRuntime, transition: TopologyTransition, events: TickEvent[]): string | null {
  if (!ensurePlaneLoaded(runtime, transition.sourcePlane) || !loadPlane(runtime, transition.sourcePlane)) {
    return `could not load source of ${transition.id}`;
  }
  const fixture =
    runtime.currentPlaneBase.transitionFixtures.find((row) => row.transitionId === transition.id)
    ?? runtime.currentPlaneBase.namedPoints.find((row) => row.id === `transition.${transition.id}`);
  if (!fixture) {
    return `missing fixture ${transition.id}`;
  }
  const sourceCell = { x: fixture.x, y: fixture.y };
  const archetype = CONTENT_REGISTRY.byId.transition.get(transition.archetypeId);
  const standOn = archetype?.activation === "step_on";
  const stand = approachCell(runtime, sourceCell, standOn);
  if (!stand) {
    return `no approach for ${transition.id}`;
  }
  movePlayerTo(runtime, sourceCell);
  const destPlane = materializePlaneActors(runtime, transition.destinationPlane);
  if (destPlane) {
    freeLanding(runtime, destPlane, arrivalCellFor(runtime, transition, playerActor(runtime), sourceCell), playerActor(runtime).id);
  }
  const produced = activateTransition(runtime, playerActor(runtime), {
    transition,
    sourceCell,
    activation: archetype?.activation ?? "interact",
    personal: false,
  });
  events.push(...produced);
  const summary = produced.map((event) => `${event.type}:${event.detail ?? ""}`).join(",");
  if (failedAction(produced) || !produced.some((event) => event.type === "transition_activated")) {
    return `blocked transition ${transition.id} [${summary}]`;
  }
  const player = playerActor(runtime);
  player.plane = { ...transition.destinationPlane };
  return null;
}

export function executeWitness(runtime: GameRuntime, witness: readonly WitnessStep[]): WitnessExecutionResult {
  const events: TickEvent[] = [];
  for (const [index, step] of witness.entries()) {
    if (step.type === "START" || step.type === "DISCOVER_DIMENSION") {
      continue;
    }
    if (step.type === "TRAVERSE_TRANSITION" && step.id) {
      const transition = runtime.topology.transitions.find((row) => row.id === step.id);
      if (!transition) {
        return fail(index, events, `missing transition ${step.id}`);
      }
      const error = traverseTransition(runtime, transition, events);
      if (error) {
        return fail(index, events, error);
      }
      continue;
    }
    if ((step.type === "COLLECT_SOURCE" || step.type === "ACQUIRE_KEY") && step.id) {
      const error = collectSource(runtime, step.id, events);
      if (error) {
        return fail(index, events, error);
      }
      continue;
    }
    if (step.type === "DEFEAT_GUARDIAN" && step.id) {
      if (runtime.save.flags.includes(`defeated:${step.id}`)) {
        continue;
      }
      const guardian = runtime.topology.guardianInstances.find((row) => row.id === step.id);
      if (guardian && !loadPlane(runtime, guardian.plane)) {
        return fail(index, events, `could not load guardian ${step.id}`);
      }
      const actor = runtime.save.actors.find((row) => row.id === step.id);
      if (!actor) {
        return fail(index, events, `missing guardian ${step.id}`);
      }
      actor.hp = 0;
      resolveDeaths(runtime, events);
      if (!runtime.save.flags.includes(`defeated:${step.id}`)) {
        return fail(index, events, `guardian ${step.id} was not defeated`);
      }
      continue;
    }
    if (step.type === "COMPLETE_QUEST" && step.id) {
      const instance =
        runtime.topology.questInstances.find((row) => row.id === step.id)
        ?? runtime.topology.questInstances.find((row) => row.questId === step.id);
      if (!instance) {
        return fail(index, events, `missing quest ${step.id}`);
      }
      startQuest(runtime, instance.questId, events);
      refreshQuestProgress(runtime, events);
      if (questState(runtime.save, instance.questId) !== "complete") {
        return fail(index, events, `quest ${instance.questId} incomplete`);
      }
      continue;
    }
    if (step.type === "LEARN_ABILITY" && step.id) {
      if (runtime.save.player.learnedAbilities.includes(step.id)) {
        continue;
      }
      const source = runtime.topology.progressionSources.find((row) => row.grants.includes(`ability:${step.id}`));
      if (!source) {
        return fail(index, events, `ability ${step.id} was not granted`);
      }
      const error = collectSource(runtime, source.id, events);
      if (error || !runtime.save.player.learnedAbilities.includes(step.id)) {
        return fail(index, events, error ?? `ability ${step.id} was not granted`);
      }
      continue;
    }
    if (step.type === "BUY_ITEM" && step.id) {
      const bought = buyShopSource(runtime, step.id, events);
      if (!bought) {
        return fail(index, events, `could not buy ${step.id}`);
      }
      continue;
    }
    if (step.type === "UNLOCK_GATE" && step.id) {
      const gate = runtime.topology.gates.find((row) => row.id === step.id);
      if (!gate) {
        return fail(index, events, `missing gate ${step.id}`);
      }
      if (!unlockGate(runtime, gate)) {
        return fail(index, events, `could not unlock ${gate.id}`);
      }
      continue;
    }
    if (step.type === "REACH_OLYMPUS") {
      const reached =
        planesEqual(runtime.save.plane, OLYMPUS_PLANE)
        || planesEqual(playerActor(runtime).plane, OLYMPUS_PLANE)
        || runtime.save.discoveredPlanes.some((plane) => planesEqual(plane, OLYMPUS_PLANE));
      if (!reached) {
        return fail(index, events, "not on Olympus");
      }
      continue;
    }
    if (step.type === "FINAL_BOSS_AVAILABLE") {
      const available =
        runtime.save.actors.some((actor) => actor.id === "boss.boss_olympus")
        || runtime.save.flags.includes("defeated:boss.boss_olympus")
        || runtime.save.discoveredPlanes.some((plane) => planesEqual(plane, OLYMPUS_PLANE))
        || planesEqual(runtime.save.plane, OLYMPUS_PLANE);
      if (!available) {
        return fail(index, events, "final boss is not available");
      }
    }
  }
  return { ok: true, stepIndex: witness.length, events };
}
