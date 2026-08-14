import { CONTENT_REGISTRY } from "../data/registry";
import { PURSUIT_PROFILES } from "../data/monsters";
import { TRANSITION_EFFECT_PROFILE_ROWS } from "../data/transitions";
import { DIRECTIONS } from "../model/save-state";
import { boundedInt, compareStableIds, semantic } from "../generation/semantic-random";
import { sharesExactlyOneDimension } from "../generation/topology-neighbours";
import type { TopologyGate, TopologyTransition } from "../generation/topology-types";
import type { PlaneBase } from "../generation/plane-types";
import { MAP_SIZE, planeKey, planesEqual, type MapCoordinate, type PlanePair } from "../model/plane";
import type {
  ActorState,
  Direction,
  PendingPlayerTransition,
  PursuitArrivalRule,
  PursuitHandoff,
  PursuitMode,
  SaveState,
} from "../model/save-state";
import { materializeNonPlayerActors, type GameRuntime } from "../runtime/game-runtime";
import { materializeRuntimePlane } from "../runtime/materialize-plane";
import { actorPreventsPersonalTransition } from "./actor-stats";
import { canOccupy, cellBlockedByTerrain, destinationCell } from "./occupancy";
import { movementCostTo } from "./pathfinding";
import type { TickEvent } from "./tick-events";

export const PURSUIT_DISTANCE = 6;

export interface TransitionAttempt {
  readonly transition: TopologyTransition;
  readonly sourceCell: MapCoordinate;
  readonly activation: "step_on" | "interact" | "edge_cross";
  readonly personal?: boolean;
}

function fail(actorId: string, detail: string): TickEvent[] {
  return [{ type: "action_failed", actorId, detail }];
}

export function activeActors(runtime: GameRuntime): ActorState[] {
  return runtime.save.actors.filter((actor) => planesEqual(actor.plane, runtime.save.plane));
}

export function ensurePlaneLoaded(runtime: GameRuntime, plane: PlanePair): PlaneBase | null {
  const key = planeKey(plane);
  const cached = runtime.planeCache.get(key);
  if (cached) {
    return cached;
  }
  const generated = materializeRuntimePlane(runtime.world, plane, runtime.generatePlane);
  if (!generated.ok) {
    return null;
  }
  runtime.planeCache.set(key, generated.plane);
  return generated.plane;
}

export function switchCurrentPlane(runtime: GameRuntime, plane: PlanePair): PlaneBase | null {
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
  for (const actor of materializeNonPlayerActors(runtime.topology, loaded, occupied)) {
    if (!known.has(actor.id)) {
      runtime.save.actors.push(actor);
    }
  }
  runtime.currentPlaneBase = loaded;
  runtime.save.plane = { a: plane.a, b: plane.b };
  runtime.save.family = loaded.family;
  return loaded;
}

export function fixtureAt(plane: PlaneBase, cell: MapCoordinate) {
  return plane.transitionFixtures.find((row) => row.x === cell.x && row.y === cell.y) ?? null;
}

export function transitionById(runtime: GameRuntime, id: string): TopologyTransition | undefined {
  return runtime.topology.transitions.find((row) => row.id === id);
}

export function worldTransitionAt(runtime: GameRuntime, plane: PlaneBase, cell: MapCoordinate): TopologyTransition | null {
  const fixture = fixtureAt(plane, cell);
  if (!fixture) {
    return null;
  }
  return transitionById(runtime, fixture.transitionId) ?? null;
}

function archetypeOf(transition: TopologyTransition) {
  return CONTENT_REGISTRY.byId.transition.get(transition.archetypeId);
}

function profileOf(transition: TopologyTransition) {
  return TRANSITION_EFFECT_PROFILE_ROWS.find((row) => row.id === transition.transitionEffectProfileId);
}

function gateOf(runtime: GameRuntime, transition: TopologyTransition): TopologyGate | undefined {
  if (!transition.gateId) {
    return undefined;
  }
  return runtime.topology.gates.find((row) => row.id === transition.gateId);
}

function inventoryCount(save: SaveState, itemId: string): number {
  const pack = save.player.inventory.filter((row) => row.itemId === itemId).reduce((sum, row) => sum + row.quantity, 0);
  const keys = save.player.keyItems.filter((row) => row.itemId === itemId).reduce((sum, row) => sum + row.quantity, 0);
  return pack + keys;
}

function conditionsMet(runtime: GameRuntime, actor: ActorState, transition: TopologyTransition, personal: boolean): boolean {
  if (runtime.save.consumedTransitionIds.includes(transition.id)) {
    return false;
  }
  if (personal && actorPreventsPersonalTransition(actor)) {
    return false;
  }
  const gate = gateOf(runtime, transition);
  if (!gate) {
    return true;
  }
  if (gate.requiredFlag && !runtime.save.flags.includes(gate.requiredFlag)) {
    return false;
  }
  if (gate.requiredItemId && inventoryCount(runtime.save, gate.requiredItemId) <= 0) {
    return false;
  }
  if (gate.requiredAbilityId && !runtime.save.player.learnedAbilities.includes(gate.requiredAbilityId)) {
    return false;
  }
  if (gate.requiredResourceId) {
    if (inventoryCount(runtime.save, gate.requiredResourceId) < (gate.requiredQuantity ?? 0)) {
      return false;
    }
  }
  if (gate.guardianInstanceId && !runtime.save.flags.includes(`defeated:${gate.guardianInstanceId}`)) {
    return false;
  }
  return true;
}

export function axisCoordinate(plane: PlanePair, position: MapCoordinate, dimension: number): number {
  return dimension === plane.a ? position.x : position.y;
}

export function preservedDimension(source: PlanePair, destination: PlanePair): number {
  if (source.a === destination.a || source.a === destination.b) {
    return source.a;
  }
  return source.b;
}

export function replacedDimension(source: PlanePair, destination: PlanePair): number {
  return preservedDimension(source, destination) === source.a ? source.b : source.a;
}

export function incomingDimension(source: PlanePair, destination: PlanePair): number {
  const preserved = preservedDimension(source, destination);
  return destination.a === preserved ? destination.b : destination.a;
}

function coordinateKey(
  runtime: GameRuntime,
  purpose: string,
  transitionId: string,
  extras: { sourcePlane?: PlanePair; sourceCell?: MapCoordinate; destDimension?: number } = {},
) {
  const parts = [
    semantic.string(runtime.save.generatorVersion),
    semantic.string(runtime.save.worldSeed),
    semantic.string(purpose),
    semantic.string(transitionId),
  ];
  if (extras.sourcePlane) {
    parts.push(semantic.plane(extras.sourcePlane));
  }
  if (extras.sourceCell) {
    parts.push(semantic.coord(extras.sourceCell));
  }
  if (extras.destDimension !== undefined) {
    parts.push(semantic.i64(extras.destDimension));
  }
  return parts;
}

export function destinationCoordinate(
  runtime: GameRuntime,
  transition: TopologyTransition,
  actor: ActorState,
  sourceCell: MapCoordinate,
): number {
  const incoming = incomingDimension(transition.sourcePlane, transition.destinationPlane);
  const replaced = replacedDimension(transition.sourcePlane, transition.destinationPlane);
  const mode = transition.coordinateMode;
  if (mode === "source_axis_copy") {
    return axisCoordinate(transition.sourcePlane, { x: actor.x, y: actor.y }, replaced);
  }
  if (mode === "deterministic_derived") {
    return boundedInt(
      coordinateKey(runtime, "runtime.transition.derivedCoord", transition.id, {
        sourcePlane: transition.sourcePlane,
        sourceCell,
        destDimension: incoming,
      }),
      0,
      MAP_SIZE - 1,
    );
  }
  return boundedInt(coordinateKey(runtime, "runtime.transition.fixedCoord", transition.id), 0, MAP_SIZE - 1);
}

export function arrivalCellFor(
  runtime: GameRuntime,
  transition: TopologyTransition,
  actor: ActorState,
  sourceCell: MapCoordinate,
): MapCoordinate {
  const preserved = preservedDimension(transition.sourcePlane, transition.destinationPlane);
  const preservedCoord = axisCoordinate(transition.sourcePlane, { x: actor.x, y: actor.y }, preserved);
  const incomingCoord = destinationCoordinate(runtime, transition, actor, sourceCell);
  const dest = transition.destinationPlane;
  return dest.a === preserved
    ? { x: preservedCoord, y: incomingCoord }
    : { x: incomingCoord, y: preservedCoord };
}

function adjacentArrival(
  destPlane: PlaneBase,
  actors: readonly ActorState[],
  origin: MapCoordinate,
  moverId: string,
  save: SaveState,
): MapCoordinate | null {
  for (const direction of DIRECTIONS) {
    const cell = destinationCell(origin, { x: direction === "east" ? 1 : direction === "west" ? -1 : 0, y: direction === "south" ? 1 : direction === "north" ? -1 : 0 }, destPlane.wraps);
    if (cell && canOccupy(destPlane, actors, cell, moverId, save)) {
      return cell;
    }
  }
  return null;
}

function nearestLegalArrival(
  destPlane: PlaneBase,
  actors: readonly ActorState[],
  origin: MapCoordinate,
  moverId: string,
  save: SaveState,
): MapCoordinate | null {
  const pending: MapCoordinate[] = [origin];
  const seen = new Set([`${origin.y},${origin.x}`]);
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (canOccupy(destPlane, actors, current, moverId, save)) {
      return current;
    }
    for (const direction of DIRECTIONS) {
      const cell = destinationCell(
        current,
        { x: direction === "east" ? 1 : direction === "west" ? -1 : 0, y: direction === "south" ? 1 : direction === "north" ? -1 : 0 },
        destPlane.wraps,
      );
      if (!cell) {
        continue;
      }
      const key = `${cell.y},${cell.x}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      pending.push(cell);
    }
  }
  return null;
}

function placeExactThenAdjacent(
  destPlane: PlaneBase,
  actors: readonly ActorState[],
  origin: MapCoordinate,
  moverId: string,
  save: SaveState,
): MapCoordinate | null {
  if (canOccupy(destPlane, actors, origin, moverId, save)) {
    return origin;
  }
  return adjacentArrival(destPlane, actors, origin, moverId, save);
}

function placeByArrivalRule(
  destPlane: PlaneBase,
  actors: readonly ActorState[],
  origin: MapCoordinate,
  moverId: string,
  save: SaveState,
  rule: PursuitArrivalRule,
): MapCoordinate | null {
  if (rule === "nearest_legal") {
    return nearestLegalArrival(destPlane, actors, origin, moverId, save);
  }
  if (rule === "adjacent_nesw") {
    return adjacentArrival(destPlane, actors, origin, moverId, save);
  }
  if (rule === "exact") {
    return canOccupy(destPlane, actors, origin, moverId, save) ? origin : null;
  }
  // Ordinary v1 pursuit: exact tile, then URDL adjacent only. World transits
  // still require the exact cell in activateTransition.
  return placeExactThenAdjacent(destPlane, actors, origin, moverId, save);
}

function recordDiscovery(save: SaveState, dest: PlanePair, events: TickEvent[]): void {
  const planeKnown = save.discoveredPlanes.some((row) => planesEqual(row, dest));
  if (!planeKnown) {
    save.discoveredPlanes.push({ a: dest.a, b: dest.b });
    save.discoveredPlanes.sort((left, right) => (left.a - right.a) || (left.b - right.b));
    events.push({ type: "plane_visited", detail: planeKey(dest) });
  }
  for (const dimension of [dest.a, dest.b]) {
    if (!save.discoveredDimensions.includes(dimension)) {
      save.discoveredDimensions.push(dimension);
      save.discoveredDimensions.sort((left, right) => left - right);
      events.push({ type: "dimension_discovered", amount: dimension });
    }
  }
}

function consumeTransition(save: SaveState, transition: TopologyTransition): void {
  const archetype = archetypeOf(transition);
  if (!archetype?.singleUseDefault) {
    return;
  }
  if (!save.consumedTransitionIds.includes(transition.id)) {
    save.consumedTransitionIds.push(transition.id);
  }
}

function clearSpaceVelocity(actor: ActorState, leavingFamily: string, events: TickEvent[]): void {
  if (leavingFamily !== "space") {
    return;
  }
  if (actor.vx === 0 && actor.vy === 0) {
    return;
  }
  actor.vx = 0;
  actor.vy = 0;
  events.push({ type: "velocity_cleared", actorId: actor.id });
}

function cancelHandoffsLeaving(save: SaveState, leaving: PlanePair, events: TickEvent[]): void {
  const kept: PursuitHandoff[] = [];
  for (const handoff of save.pursuits) {
    if (!planesEqual(handoff.destinationPlane, leaving)) {
      kept.push(handoff);
      continue;
    }
    events.push({ type: "pursuit_cancelled", actorId: handoff.actorId, targetId: handoff.transitionId });
  }
  save.pursuits = kept;
}

export function activateTransition(runtime: GameRuntime, actor: ActorState, attempt: TransitionAttempt): TickEvent[] {
  const { transition, sourceCell, personal } = attempt;
  const archetype = archetypeOf(transition);
  if (!archetype) {
    return fail(actor.id, "unknown archetype");
  }
  if (transition.initiallyBroken || transition.progressionClass === "optional_broken") {
    return fail(actor.id, "broken");
  }
  if (!sharesExactlyOneDimension(transition.sourcePlane, transition.destinationPlane)) {
    return fail(actor.id, "illegal destination");
  }
  if (!conditionsMet(runtime, actor, transition, personal === true)) {
    return fail(actor.id, "blocked");
  }
  const destPlane = ensurePlaneLoaded(runtime, transition.destinationPlane);
  if (!destPlane) {
    return fail(actor.id, "blocked");
  }
  const arrival = arrivalCellFor(runtime, transition, actor, sourceCell);
  if (arrival.x < 0 || arrival.x >= MAP_SIZE || arrival.y < 0 || arrival.y >= MAP_SIZE) {
    return fail(actor.id, "blocked");
  }
  if (cellBlockedByTerrain(destPlane, arrival)) {
    return fail(actor.id, "broken");
  }
  if (!canOccupy(destPlane, runtime.save.actors, arrival, actor.id, runtime.save)) {
    return fail(actor.id, "blocked");
  }

  const leavingFamily = runtime.save.family;
  const previous = { plane: { a: actor.plane.a, b: actor.plane.b }, x: actor.x, y: actor.y };
  const events: TickEvent[] = [
    { type: "transition_activated", actorId: actor.id, targetId: transition.id, detail: planeKey(transition.destinationPlane), x: arrival.x, y: arrival.y },
  ];
  actor.plane = { a: transition.destinationPlane.a, b: transition.destinationPlane.b };
  actor.x = arrival.x;
  actor.y = arrival.y;
  clearSpaceVelocity(actor, leavingFamily, events);
  consumeTransition(runtime.save, transition);

  if (actor.kind === "player") {
    runtime.save.lastTransition = previous;
    recordDiscovery(runtime.save, transition.destinationPlane, events);
    switchCurrentPlane(runtime, transition.destinationPlane);
    const profile = profileOf(transition);
    runtime.pendingPlayerTransition = {
      sourcePlane: previous.plane,
      sourceCell,
      transitionId: transition.id,
      destinationPlane: transition.destinationPlane,
      arrival,
      pursuitAllowed: (archetype.pursuitAllowed && (profile?.pursuit ?? true)) === true,
      archetypeId: transition.archetypeId,
      profileId: transition.transitionEffectProfileId,
    };
  }

  return events;
}

function activationMatches(transition: TopologyTransition, mode: TransitionAttempt["activation"]): boolean {
  const archetype = archetypeOf(transition);
  return archetype?.activation === mode;
}

export function tryActivateWorldTransition(
  runtime: GameRuntime,
  actor: ActorState,
  cell: MapCoordinate,
  mode: TransitionAttempt["activation"],
): TickEvent[] | null {
  const transition = worldTransitionAt(runtime, runtime.currentPlaneBase, cell);
  if (!transition || !planesEqual(transition.sourcePlane, runtime.currentPlaneBase.plane)) {
    return null;
  }
  if (!activationMatches(transition, mode)) {
    return null;
  }
  if (mode === "step_on" && (transition.initiallyBroken || transition.progressionClass === "optional_broken")) {
    return [];
  }
  return activateTransition(runtime, actor, { transition, sourceCell: cell, activation: mode });
}

export function maybeStepOnTransition(runtime: GameRuntime, actor: ActorState, voluntary: boolean): TickEvent[] {
  const transition = worldTransitionAt(runtime, runtime.currentPlaneBase, actor);
  if (!transition) {
    return [];
  }
  const archetype = archetypeOf(transition);
  if (archetype?.activation !== "step_on") {
    return [];
  }
  if (!voluntary && !archetype.forcedActivation) {
    return [];
  }
  if (transition.initiallyBroken || transition.progressionClass === "optional_broken") {
    return [];
  }
  return activateTransition(runtime, actor, {
    transition,
    sourceCell: { x: actor.x, y: actor.y },
    activation: "step_on",
  });
}

export function tryEdgeCross(runtime: GameRuntime, actor: ActorState, direction: Direction): TickEvent[] | null {
  const dest = destinationCell(actor, { x: direction === "east" ? 1 : direction === "west" ? -1 : 0, y: direction === "south" ? 1 : direction === "north" ? -1 : 0 }, runtime.currentPlaneBase.wraps);
  if (dest) {
    return null;
  }
  return tryActivateWorldTransition(runtime, actor, { x: actor.x, y: actor.y }, "edge_cross");
}

function pursuitProfile(actor: ActorState) {
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  return PURSUIT_PROFILES.find((row) => row.id === species?.pursuitProfile);
}

function pursuitModeFor(profile: (typeof PURSUIT_PROFILES)[number]): PursuitMode {
  return profile.sameTransitionRequired ? "follow_same_transition" : "phase_to_arrival";
}

function eligiblePursuer(
  runtime: GameRuntime,
  actor: ActorState,
  pending: PendingPlayerTransition,
  sourcePlane: PlaneBase,
): boolean {
  if (actor.kind !== "monster" && actor.kind !== "guardian") {
    return false;
  }
  if (actor.hp <= 0 || actor.aiState !== "chasing") {
    return false;
  }
  if (!planesEqual(actor.plane, pending.sourcePlane)) {
    return false;
  }
  const profile = pursuitProfile(actor);
  if (!profile?.canCross || profile.delay <= 0) {
    return false;
  }
  const archetype = CONTENT_REGISTRY.byId.transition.get(pending.archetypeId);
  const category = archetype?.pursuitCategory;
  const allowedByCategory = category !== null && category !== undefined && (profile.categories as readonly string[]).includes(category);
  if (!allowedByCategory && profile.sameTransitionRequired) {
    return false;
  }
  if (!pending.pursuitAllowed && profile.sameTransitionRequired) {
    return false;
  }
  const cost = movementCostTo(sourcePlane, runtime.save, runtime.save.actors, actor, pending.sourceCell);
  return cost !== null && cost <= PURSUIT_DISTANCE;
}

function createHandoffs(runtime: GameRuntime, pending: PendingPlayerTransition, events: TickEvent[]): void {
  const sourcePlane = runtime.planeCache.get(planeKey(pending.sourcePlane));
  if (!sourcePlane) {
    return;
  }
  const existing = new Set(runtime.save.pursuits.map((row) => row.actorId));
  const candidates = runtime.save.actors
    .filter((actor) => eligiblePursuer(runtime, actor, pending, sourcePlane) && !existing.has(actor.id))
    .sort((left, right) => compareStableIds(left.id, right.id));
  for (const actor of candidates) {
    const profile = pursuitProfile(actor);
    if (!profile) {
      continue;
    }
    const handoff: PursuitHandoff = {
      actorId: actor.id,
      sourcePlane: { a: pending.sourcePlane.a, b: pending.sourcePlane.b },
      transitionId: pending.transitionId,
      destinationPlane: { a: pending.destinationPlane.a, b: pending.destinationPlane.b },
      remainingDelay: profile.delay,
      pursuitMode: pursuitModeFor(profile),
      arrivalRule: "exact_or_fail",
      arrivalX: pending.arrival.x,
      arrivalY: pending.arrival.y,
    };
    runtime.save.pursuits.push(handoff);
    events.push({ type: "pursuit_started", actorId: actor.id, targetId: pending.transitionId, amount: profile.delay });
  }
}

function resolveHandoff(runtime: GameRuntime, handoff: PursuitHandoff, events: TickEvent[]): void {
  const player = runtime.save.actors.find((row) => row.id === "player");
  if (!player || !planesEqual(player.plane, handoff.destinationPlane)) {
    events.push({ type: "pursuit_cancelled", actorId: handoff.actorId, targetId: handoff.transitionId });
    return;
  }
  const destPlane = ensurePlaneLoaded(runtime, handoff.destinationPlane);
  const actor = runtime.save.actors.find((row) => row.id === handoff.actorId);
  if (!destPlane || !actor || actor.hp <= 0) {
    events.push({ type: "pursuit_cancelled", actorId: handoff.actorId, targetId: handoff.transitionId });
    return;
  }
  const origin = { x: handoff.arrivalX, y: handoff.arrivalY };
  const arrival = placeByArrivalRule(destPlane, runtime.save.actors, origin, actor.id, runtime.save, handoff.arrivalRule);
  if (!arrival) {
    events.push({ type: "pursuit_cancelled", actorId: handoff.actorId, targetId: handoff.transitionId });
    return;
  }
  actor.plane = { a: handoff.destinationPlane.a, b: handoff.destinationPlane.b };
  actor.x = arrival.x;
  actor.y = arrival.y;
  actor.aiState = "chasing";
  events.push({ type: "pursuit_arrived", actorId: actor.id, targetId: handoff.transitionId, x: arrival.x, y: arrival.y });
}

export function evaluatePursuitHandoffs(runtime: GameRuntime, events: TickEvent[]): void {
  const pending = runtime.pendingPlayerTransition;
  runtime.pendingPlayerTransition = null;
  const remaining: PursuitHandoff[] = [];
  for (const handoff of runtime.save.pursuits) {
    if (!planesEqual(runtime.save.plane, handoff.destinationPlane)) {
      remaining.push(handoff);
      continue;
    }
    handoff.remainingDelay -= 1;
    if (handoff.remainingDelay > 0) {
      remaining.push(handoff);
      continue;
    }
    resolveHandoff(runtime, handoff, events);
  }
  runtime.save.pursuits = remaining;
  if (pending) {
    cancelHandoffsLeaving(runtime.save, pending.sourcePlane, events);
    createHandoffs(runtime, pending, events);
  }
}

export function syncPlaneAfterPlayerMove(runtime: GameRuntime, events: TickEvent[]): void {
  const player = runtime.save.actors.find((row) => row.id === "player");
  if (!player) {
    return;
  }
  if (planesEqual(player.plane, runtime.currentPlaneBase.plane)) {
    return;
  }
  cancelHandoffsLeaving(runtime.save, runtime.currentPlaneBase.plane, events);
  switchCurrentPlane(runtime, player.plane);
}
