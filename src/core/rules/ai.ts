import { CONTENT_REGISTRY } from "../data/registry";
import { manhattanOnPlane } from "../generation/grid";
import { boundedUnit, percentile, semantic } from "../generation/semantic-random";
import type { PlaneBase } from "../generation/plane-types";
import type { AbilityDefinition, AttackDefinition, BossPhase, MonsterSpecies } from "../model/content-types";
import type { MapCoordinate } from "../model/plane";
import { planesEqual } from "../model/plane";
import {
  DIRECTION_DELTA,
  DIRECTIONS,
  type ActorState,
  type Direction,
  type IntentionalAction,
  type SaveState,
} from "../model/save-state";
import type { GameRuntime } from "../runtime/game-runtime";
import { actorIsHidden, actorPreventsIntentionalActions, grantedAbilityIds, grantedAttackIds } from "./actor-stats";
import { applyEffectIds } from "./apply-effects";
import { combatActionLegal } from "./combat";
import { hasLineOfSight } from "./los";
import { destinationCell } from "./occupancy";
import { legalMoveDirections, nearestReachable, shortestPathFirstAction } from "./pathfinding";
import { landingAfterThrust, spacePhysicsActive } from "./space";
import { orthogonalAdjacent } from "./targeting";
import type { TickEvent } from "./tick-events";

const WAIT: IntentionalAction = { type: "wait" };
const GUARD_RADIUS = 4;
const AMBUSH_RADIUS = 3;
const SKIRMISH_MIN = 2;
const SKIRMISH_MAX = 4;
const CONTROL_PREFERRED_DISTANCE = 3;
const FLEE_PERCENT = 25;

const CONTROL_TAGS = new Set([
  "status_delivery",
  "forced_movement",
  "summon",
  "control",
  "silence",
  "anchor",
  "fear",
  "confuse",
  "charm",
]);

interface AiContext {
  readonly runtime: GameRuntime;
  readonly save: SaveState;
  readonly plane: PlaneBase;
  readonly actor: ActorState;
  readonly player: ActorState;
  readonly species: MonsterSpecies;
  readonly attackIds: readonly string[];
  readonly abilityIds: readonly string[];
  readonly events: TickEvent[];
}

function aiKey(ctx: AiContext, purposeTag: string, ordinal = 0) {
  return [
    semantic.string(ctx.save.generatorVersion),
    semantic.string(ctx.save.worldSeed),
    semantic.string("runtime.ai"),
    semantic.string(ctx.actor.id),
    semantic.i64(ctx.save.tick),
    semantic.string(purposeTag),
    semantic.i64(ordinal),
  ];
}

function distToPlayer(ctx: AiContext, from: MapCoordinate = ctx.actor): number {
  return manhattanOnPlane(from, ctx.player, ctx.plane.wraps);
}

function hiddenDetectable(viewer: ActorState, target: ActorState, wraps: boolean): boolean {
  if (!actorIsHidden(target)) {
    return true;
  }
  return orthogonalAdjacent(viewer, wraps).some((cell) => cell.x === target.x && cell.y === target.y);
}

export function detectsPlayer(plane: PlaneBase, save: SaveState, actor: ActorState, player: ActorState): boolean {
  if (!planesEqual(actor.plane, player.plane)) {
    return false;
  }
  if (actor.lastAffectedTick >= 0 && actor.lastAffectedTick === save.tick - 1) {
    return true;
  }
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  if (!species) {
    return false;
  }
  if (!hiddenDetectable(actor, player, plane.wraps)) {
    return false;
  }
  const ignoreLos = species.traits.includes("ignore_los_detection") || species.traits.includes("ignoreLOS");
  if (!ignoreLos && !hasLineOfSight(plane, actor, player)) {
    return false;
  }
  if (species.detection === "unlimited") {
    return true;
  }
  return manhattanOnPlane(actor, player, plane.wraps) <= species.detection;
}

function attackById(id: string): AttackDefinition | undefined {
  return CONTENT_REGISTRY.byId.attack.get(id);
}

function abilityById(id: string): AbilityDefinition | undefined {
  return CONTENT_REGISTRY.byId.ability.get(id);
}

function resolvedAttack(action: IntentionalAction): AttackDefinition | undefined {
  if (action.type === "attack" && action.attackId) {
    return attackById(action.attackId);
  }
  if (action.type === "ability" && action.abilityId) {
    const ability = abilityById(action.abilityId);
    return ability?.attackId ? attackById(ability.attackId) : undefined;
  }
  return undefined;
}

function actionTags(action: IntentionalAction): readonly string[] {
  if (action.type === "ability" && action.abilityId) {
    const ability = abilityById(action.abilityId);
    const attack = resolvedAttack(action);
    return [...(ability?.tags ?? []), ...(attack?.tags ?? [])];
  }
  return resolvedAttack(action)?.tags ?? [];
}

function isControlAction(action: IntentionalAction): boolean {
  const tags = actionTags(action);
  if (tags.some((tag) => CONTROL_TAGS.has(tag))) {
    return true;
  }
  return Boolean(resolvedAttack(action)?.onHitStatusId);
}

function isRangedAction(action: IntentionalAction): boolean {
  const tags = actionTags(action);
  if (tags.includes("ranged")) {
    return true;
  }
  const attack = resolvedAttack(action);
  return attack !== undefined && attack.range > 1;
}

function isOpeningAction(action: IntentionalAction): boolean {
  return actionTags(action).includes("opening");
}

function isBeneficialAction(action: IntentionalAction): boolean {
  return actionTags(action).includes("beneficial");
}

function aimedAt(player: ActorState, action: IntentionalAction): IntentionalAction {
  return { ...action, targetId: player.id, targetX: player.x, targetY: player.y };
}

function canonicalActions(ctx: AiContext): IntentionalAction[] {
  const actions: IntentionalAction[] = [];
  for (const abilityId of ctx.abilityIds) {
    actions.push(aimedAt(ctx.player, { type: "ability", abilityId }));
  }
  for (const attackId of ctx.attackIds) {
    actions.push(aimedAt(ctx.player, { type: "attack", attackId }));
  }
  return actions;
}

function firstLegal(
  ctx: AiContext,
  actions: readonly IntentionalAction[],
  origin?: MapCoordinate,
  ignoreCooldown = false,
  predicate: (action: IntentionalAction) => boolean = () => true,
): IntentionalAction | null {
  for (const action of actions) {
    if (!predicate(action)) {
      continue;
    }
    if (combatActionLegal(ctx.save, ctx.plane, ctx.actor, action, origin ? { origin, ignoreCooldown } : { ignoreCooldown })) {
      return action;
    }
  }
  return null;
}

function countLegal(
  ctx: AiContext,
  origin: MapCoordinate,
  predicate: (action: IntentionalAction) => boolean = () => true,
  ignoreCooldown = false,
): number {
  return canonicalActions(ctx).filter(
    (action) =>
      predicate(action) && combatActionLegal(ctx.save, ctx.plane, ctx.actor, action, { origin, ignoreCooldown }),
  ).length;
}

function couldTargetPlayerFrom(ctx: AiContext, origin: MapCoordinate, predicate?: (action: IntentionalAction) => boolean): boolean {
  return firstLegal(ctx, canonicalActions(ctx), origin, true, predicate) !== null;
}

function moveAction(direction: Direction): IntentionalAction {
  return { type: "move", direction };
}

function destOf(ctx: AiContext, direction: Direction): MapCoordinate | null {
  return destinationCell(ctx.actor, DIRECTION_DELTA[direction], ctx.plane.wraps);
}

function oneStepDestinations(ctx: AiContext): { direction: Direction; dest: MapCoordinate }[] {
  if (spacePhysicsActive(ctx.save.family)) {
    return DIRECTIONS.map((direction) => ({
      direction,
      dest: landingAfterThrust(ctx.plane, ctx.save.actors, ctx.actor, direction, ctx.save),
    })).filter((row, index, rows) => {
      const origin = { x: ctx.actor.x, y: ctx.actor.y };
      if (row.dest.x === origin.x && row.dest.y === origin.y) {
        return false;
      }
      return rows.findIndex((other) => other.dest.x === row.dest.x && other.dest.y === row.dest.y) === index;
    });
  }
  const rows: { direction: Direction; dest: MapCoordinate }[] = [];
  for (const direction of legalMoveDirections(ctx.plane, ctx.save.actors, ctx.actor, ctx.save)) {
    const dest = destOf(ctx, direction);
    if (dest) {
      rows.push({ direction, dest });
    }
  }
  return rows;
}

function pickScoredMove(
  ctx: AiContext,
  score: (dest: MapCoordinate) => number[] | null,
): Direction | null {
  let best: { direction: Direction; score: number[] } | null = null;
  for (const row of oneStepDestinations(ctx)) {
    const value = score(row.dest);
    if (!value) {
      continue;
    }
    if (!best || lexGreater(value, best.score)) {
      best = { direction: row.direction, score: value };
    }
  }
  return best?.direction ?? null;
}

function lexGreater(left: number[], right: number[]): boolean {
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) {
      return a > b;
    }
  }
  return false;
}

function maximizeDistance(ctx: AiContext, preferLos = false): IntentionalAction {
  const direction = pickScoredMove(ctx, (dest) => {
    const los = hasLineOfSight(ctx.plane, dest, ctx.player) ? 1 : 0;
    return preferLos ? [distToPlayer(ctx, dest), los] : [distToPlayer(ctx, dest)];
  });
  return direction ? moveAction(direction) : WAIT;
}

function stepToward(ctx: AiContext, goals: readonly MapCoordinate[]): IntentionalAction {
  return shortestPathFirstAction(ctx.plane, ctx.save, ctx.save.actors, ctx.actor, goals) ?? WAIT;
}

function brute(ctx: AiContext): IntentionalAction {
  const legal = firstLegal(ctx, canonicalActions(ctx));
  if (legal) {
    return legal;
  }
  const cell = nearestReachable(ctx.plane, ctx.save, ctx.save.actors, ctx.actor, (origin) =>
    couldTargetPlayerFrom(ctx, origin),
  );
  if (!cell) {
    return WAIT;
  }
  return stepToward(ctx, [cell]);
}

function skirmisher(ctx: AiContext): IntentionalAction {
  const distance = distToPlayer(ctx);
  if (distance >= SKIRMISH_MIN && distance <= SKIRMISH_MAX) {
    const legal = firstLegal(ctx, canonicalActions(ctx));
    if (legal) {
      return legal;
    }
    const direction = pickScoredMove(ctx, (dest) => {
      const next = distToPlayer(ctx, dest);
      if (next < SKIRMISH_MIN || next > SKIRMISH_MAX) {
        return null;
      }
      return [countLegal(ctx, dest), next];
    });
    return direction ? moveAction(direction) : WAIT;
  }
  if (distance < SKIRMISH_MIN) {
    const direction = pickScoredMove(ctx, (dest) => {
      const los = hasLineOfSight(ctx.plane, dest, ctx.player) ? 1 : 0;
      return [distToPlayer(ctx, dest), los];
    });
    return direction ? moveAction(direction) : WAIT;
  }
  const band = nearestReachable(ctx.plane, ctx.save, ctx.save.actors, ctx.actor, (cell) => {
    const next = distToPlayer(ctx, cell);
    return next >= SKIRMISH_MIN && next <= SKIRMISH_MAX;
  });
  return band ? stepToward(ctx, [band]) : WAIT;
}

function maxRangedRange(ctx: AiContext): number {
  let max = 0;
  for (const action of canonicalActions(ctx)) {
    if (!isRangedAction(action)) {
      continue;
    }
    const attack = resolvedAttack(action);
    if (attack) {
      max = Math.max(max, attack.range);
    }
  }
  return max;
}

function sniper(ctx: AiContext): IntentionalAction {
  const ranged = firstLegal(ctx, canonicalActions(ctx), undefined, false, isRangedAction);
  if (ranged) {
    return ranged;
  }
  const cap = maxRangedRange(ctx);
  const currentRanged = countLegal(ctx, ctx.actor, isRangedAction);
  let best: { direction: Direction; dest: MapCoordinate; score: number[] } | null = null;
  for (const row of oneStepDestinations(ctx)) {
    const rangedCount = countLegal(ctx, row.dest, isRangedAction);
    const score = [rangedCount, Math.min(distToPlayer(ctx, row.dest), cap)];
    if (!best || lexGreater(score, best.score)) {
      best = { direction: row.direction, dest: row.dest, score };
    }
  }
  if (best && countLegal(ctx, best.dest, isRangedAction) > currentRanged) {
    return moveAction(best.direction);
  }
  if (distToPlayer(ctx) < 2) {
    return maximizeDistance(ctx);
  }
  const cell = nearestReachable(ctx.plane, ctx.save, ctx.save.actors, ctx.actor, (origin) =>
    couldTargetPlayerFrom(ctx, origin, isRangedAction),
  );
  return cell ? stepToward(ctx, [cell]) : WAIT;
}

function controller(ctx: AiContext): IntentionalAction {
  const control = firstLegal(ctx, canonicalActions(ctx), undefined, false, isControlAction);
  if (control) {
    return control;
  }
  const direct = firstLegal(ctx, canonicalActions(ctx), undefined, false, (action) => !isControlAction(action));
  if (direct) {
    return direct;
  }
  if (distToPlayer(ctx) < 2) {
    return maximizeDistance(ctx);
  }
  const direction = pickScoredMove(ctx, (dest) => {
    const controlCount = countLegal(ctx, dest, isControlAction);
    const closeness = -Math.abs(distToPlayer(ctx, dest) - CONTROL_PREFERRED_DISTANCE);
    return [controlCount, closeness];
  });
  return direction ? moveAction(direction) : WAIT;
}

function supporter(ctx: AiContext): IntentionalAction {
  const beneficial = firstLegal(ctx, canonicalActions(ctx), undefined, false, isBeneficialAction);
  if (beneficial) {
    return beneficial;
  }
  const direct = firstLegal(ctx, canonicalActions(ctx), undefined, false, (action) => !isBeneficialAction(action));
  if (direct) {
    return direct;
  }
  return brute(ctx);
}

function fleeing(ctx: AiContext): IntentionalAction {
  const direction = pickScoredMove(ctx, (dest) => {
    const brokenLos = hasLineOfSight(ctx.plane, dest, ctx.player) ? 0 : 1;
    return [distToPlayer(ctx, dest), brokenLos];
  });
  if (direction) {
    return moveAction(direction);
  }
  return firstLegal(ctx, canonicalActions(ctx)) ?? WAIT;
}

function stationary(ctx: AiContext): IntentionalAction {
  return firstLegal(ctx, canonicalActions(ctx)) ?? WAIT;
}

function wanderIdle(ctx: AiContext): IntentionalAction {
  const roll = percentile(aiKey(ctx, "wander"));
  if (roll < 50) {
    return WAIT;
  }
  const legal = legalMoveDirections(ctx.plane, ctx.save.actors, ctx.actor, ctx.save);
  if (legal.length === 0) {
    return WAIT;
  }
  return moveAction(legal[boundedUnit(aiKey(ctx, "wander.move"), legal.length)]!);
}

function clampToRadius(ctx: AiContext, action: IntentionalAction, origin: MapCoordinate, radius: number): IntentionalAction {
  if (action.type !== "move" || !action.direction) {
    return action;
  }
  const dest = destOf(ctx, action.direction);
  if (!dest || manhattanOnPlane(dest, origin, ctx.plane.wraps) <= radius) {
    return action;
  }
  const direction = pickScoredMove(ctx, (cell) => {
    if (manhattanOnPlane(cell, origin, ctx.plane.wraps) > radius) {
      return null;
    }
    return [-manhattanOnPlane(cell, ctx.player, ctx.plane.wraps)];
  });
  return direction ? moveAction(direction) : WAIT;
}

function guardian(ctx: AiContext, combatProfile: string): IntentionalAction {
  const origin = { x: ctx.actor.guardX, y: ctx.actor.guardY };
  const playerInside = distToPlayer(ctx, origin) <= GUARD_RADIUS;
  if (playerInside && detectsPlayer(ctx.plane, ctx.save, ctx.actor, ctx.player)) {
    return clampToRadius(ctx, selectProfile(ctx, combatProfile), origin, GUARD_RADIUS);
  }
  if (ctx.actor.x === origin.x && ctx.actor.y === origin.y) {
    return WAIT;
  }
  return stepToward(ctx, [origin]);
}

function ambusher(ctx: AiContext, postProfile: string): IntentionalAction {
  if (!ctx.actor.ambushReleased) {
    if (distToPlayer(ctx) > AMBUSH_RADIUS) {
      return WAIT;
    }
    ctx.actor.ambushReleased = true;
    if (ctx.actor.aiState === "idle") {
      ctx.actor.aiState = "alert";
    }
    const opening = firstLegal(ctx, canonicalActions(ctx), undefined, false, isOpeningAction);
    if (opening) {
      return opening;
    }
    return selectProfile(ctx, postProfile);
  }
  return selectProfile(ctx, postProfile);
}

export function progressBossPhases(
  save: SaveState,
  plane: PlaneBase,
  actor: ActorState,
  phases: readonly BossPhase[],
  events: TickEvent[],
): BossPhase {
  while (actor.aiPhaseIndex < phases.length - 1) {
    const next = phases[actor.aiPhaseIndex + 1]!;
    if (next.hpAtMostPercent !== null) {
      const percent = actor.maxHp <= 0 ? 0 : (actor.hp * 100) / actor.maxHp;
      if (percent > next.hpAtMostPercent) {
        break;
      }
    }
    actor.aiPhaseIndex += 1;
    if (next.entryEffectOrBundleId) {
      applyEffectIds(save, plane, [next.entryEffectOrBundleId], actor, actor, events);
    }
  }
  return phases[actor.aiPhaseIndex] ?? phases[0]!;
}

function confusedAction(ctx: AiContext): IntentionalAction {
  const options: IntentionalAction[] = [WAIT];
  for (const direction of legalMoveDirections(ctx.plane, ctx.save.actors, ctx.actor, ctx.save)) {
    options.push(moveAction(direction));
  }
  for (const action of canonicalActions(ctx)) {
    if (combatActionLegal(ctx.save, ctx.plane, ctx.actor, action)) {
      options.push(action);
    }
  }
  return options[boundedUnit(aiKey(ctx, "confused"), options.length)]!;
}

function selectProfile(ctx: AiContext, profile: string): IntentionalAction {
  switch (profile) {
    case "stationary":
      return stationary(ctx);
    case "wanderer":
      return ctx.actor.aiState === "idle" ? wanderIdle(ctx) : brute(ctx);
    case "brute":
      return brute(ctx);
    case "skirmisher":
      return skirmisher(ctx);
    case "sniper":
      return sniper(ctx);
    case "controller":
      return controller(ctx);
    case "supporter":
      return supporter(ctx);
    case "coward":
      return ctx.actor.aiState === "fleeing" ? fleeing(ctx) : brute(ctx);
    case "guardian":
      return guardian(ctx, ctx.species.inPlaneAi ?? "brute");
    case "ambusher":
      return ambusher(ctx, ctx.species.inPlaneAi ?? "brute");
    case "dimensional_hunter":
      return selectProfile(ctx, ctx.species.inPlaneAi ?? "brute");
    case "boss_scripted": {
      const boss = CONTENT_REGISTRY.bosses.find((row) => row.speciesId === ctx.species.id);
      if (!boss || boss.phases.length === 0) {
        return brute(ctx);
      }
      const phase = progressBossPhases(ctx.save, ctx.plane, ctx.actor, boss.phases, ctx.events);
      const phased: AiContext = { ...ctx, attackIds: phase.attackIds, abilityIds: [] };
      return selectProfile(phased, phase.ai);
    }
    default:
      return brute(ctx);
  }
}

function transitionState(ctx: AiContext): void {
  if (actorPreventsIntentionalActions(ctx.actor)) {
    ctx.actor.aiState = "disabled";
    return;
  }
  if (ctx.species.aiProfile === "coward") {
    const percent = ctx.actor.maxHp <= 0 ? 0 : (ctx.actor.hp * 100) / ctx.actor.maxHp;
    if (percent <= FLEE_PERCENT || ctx.actor.aiState === "fleeing") {
      ctx.actor.aiState = "fleeing";
      return;
    }
  }
  const detected = detectsPlayer(ctx.plane, ctx.save, ctx.actor, ctx.player);
  const affectedLastTick = ctx.actor.lastAffectedTick >= 0 && ctx.actor.lastAffectedTick === ctx.save.tick - 1;
  if (ctx.actor.aiState === "disabled") {
    ctx.actor.aiState = detected ? "alert" : "idle";
    return;
  }
  if (ctx.actor.aiState === "idle") {
    if (detected) {
      ctx.actor.aiState = "alert";
    }
    return;
  }
  if (ctx.actor.aiState === "alert") {
    ctx.actor.aiState = detected ? "chasing" : "idle";
    return;
  }
  if (ctx.actor.aiState === "chasing") {
    if (!detected && !affectedLastTick) {
      ctx.actor.aiState = "idle";
    }
  }
}

function toSpaceAction(save: SaveState, action: IntentionalAction): IntentionalAction {
  if (!spacePhysicsActive(save.family) || action.type !== "move" || !action.direction) {
    return action;
  }
  return { type: "thrust", direction: action.direction };
}

export function selectMonsterAction(runtime: GameRuntime, actor: ActorState, events: TickEvent[] = []): IntentionalAction {
  if (actor.kind === "npc" || actor.kind === "player") {
    return WAIT;
  }
  const species = CONTENT_REGISTRY.byId.monster.get(actor.definitionId);
  const player = runtime.save.actors.find((row) => row.id === "player");
  if (!species || !player) {
    return WAIT;
  }
  const ctx: AiContext = {
    runtime,
    save: runtime.save,
    plane: runtime.currentPlaneBase,
    actor,
    player,
    species,
    attackIds: grantedAttackIds(runtime.save, actor),
    abilityIds: grantedAbilityIds(runtime.save, actor),
    events,
  };
  if (species.aiProfile === "boss_scripted") {
    const boss = CONTENT_REGISTRY.bosses.find((row) => row.speciesId === species.id);
    if (boss && boss.phases.length > 0) {
      progressBossPhases(ctx.save, ctx.plane, ctx.actor, boss.phases, ctx.events);
    }
  }
  transitionState(ctx);
  if (ctx.actor.aiState === "disabled") {
    return WAIT;
  }
  if (ctx.actor.statuses.some((row) => row.id === "confused")) {
    return toSpaceAction(runtime.save, confusedAction(ctx));
  }
  const profile = species.aiProfile;
  if (ctx.actor.aiState === "idle" && profile !== "wanderer" && profile !== "guardian" && profile !== "ambusher") {
    return WAIT;
  }
  return toSpaceAction(runtime.save, selectProfile(ctx, profile));
}
