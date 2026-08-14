import type { FamilyId } from "../model/ids";
import { MAP_SIZE, planesEqual, type MapCoordinate, type PlanePair } from "../model/plane";
import type { ActorKind } from "../model/save-state";
import { actorsOnPlane, doorRuntimeState, featureAt } from "../rules/occupancy";
import { groundItemsOnPlane } from "../rules/inventory";
import { orthogonalAdjacent } from "../rules/targeting";
import { fixtureAt, transitionById } from "../rules/transitions";
import { playerActor, type GameRuntime } from "../runtime/game-runtime";
import type { TickEvent } from "../rules/tick-events";
import { cellIsVisible, visibilityProfileFor } from "./visibility";

export interface PlaneCellView {
  readonly x: number;
  readonly y: number;
  readonly terrainId: string;
  readonly featureId: string | null;
  readonly featureState: string | null;
  readonly visible: boolean;
}

export interface ActorView {
  readonly id: string;
  readonly definitionId: string;
  readonly kind: ActorKind;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly visible: boolean;
}

export interface GroundItemView {
  readonly id: string;
  readonly itemId: string;
  readonly x: number;
  readonly y: number;
}

export interface EffectView {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

export interface PlaneView {
  readonly plane: PlanePair;
  readonly family: FamilyId;
  readonly wraps: boolean;
  readonly tick: number;
  readonly cells: readonly PlaneCellView[];
  readonly actors: readonly ActorView[];
  readonly items: readonly GroundItemView[];
  readonly targeting: readonly { readonly x: number; readonly y: number }[];
  readonly effects: readonly EffectView[];
  readonly visibilityProfileId: string;
  readonly visibilityRadius: number | "unlimited";
}

function eventCell(runtime: GameRuntime, event: TickEvent): { x: number; y: number } | null {
  if (event.x !== undefined && event.y !== undefined) {
    return { x: event.x, y: event.y };
  }
  const id = event.targetId ?? event.actorId;
  if (!id) {
    return null;
  }
  const actor = runtime.save.actors.find((row) => row.id === id);
  return actor ? { x: actor.x, y: actor.y } : null;
}

export function transitionFixtureState(runtime: GameRuntime, cell: MapCoordinate): string | null {
  const fixture = fixtureAt(runtime.currentPlaneBase, cell);
  if (!fixture) {
    return null;
  }
  const transition = transitionById(runtime, fixture.transitionId);
  if (!transition) {
    return null;
  }
  if (transition.initiallyBroken || transition.progressionClass === "optional_broken") {
    return "broken";
  }
  if (planesEqual(transition.sourcePlane, runtime.currentPlaneBase.plane)) {
    return "exit";
  }
  return "arrival";
}

function featureRuntimeState(runtime: GameRuntime, cell: MapCoordinate, featureId: string | null): string | null {
  if (featureId === "door") {
    return doorRuntimeState(runtime.save, runtime.currentPlaneBase, cell);
  }
  if (featureId === "transition_fixture") {
    return transitionFixtureState(runtime, cell);
  }
  return null;
}

function effectFromEvent(runtime: GameRuntime, event: TickEvent, index: number): EffectView | null {
  const cell = eventCell(runtime, event);
  if (!cell) {
    return null;
  }
  if (event.type === "attack_hit" || event.type === "damage_taken") {
    return { id: `fx-${index}`, kind: "fb_hit", x: cell.x, y: cell.y };
  }
  if (event.type === "attack_miss") {
    return { id: `fx-${index}`, kind: "fb_miss", x: cell.x, y: cell.y };
  }
  if (event.type === "monster_died" || event.type === "player_died") {
    return { id: `fx-${index}`, kind: "fb_death", x: cell.x, y: cell.y };
  }
  if (event.type === "pursuit_arrived") {
    return { id: `fx-${index}`, kind: "pursuit_arrival", x: cell.x, y: cell.y };
  }
  return null;
}

export function getVisiblePlaneView(runtime: GameRuntime, events: readonly TickEvent[] = []): PlaneView {
  const save = runtime.save;
  const plane = runtime.currentPlaneBase;
  const player = playerActor(runtime);
  const profile = visibilityProfileFor(runtime);
  const cells: PlaneCellView[] = [];
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const cell = { x, y };
      const featureId = featureAt(plane, cell);
      cells.push({
        x,
        y,
        terrainId: plane.terrain[y]?.[x] ?? "void_floor",
        featureId,
        featureState: featureRuntimeState(runtime, cell, featureId),
        visible: cellIsVisible(runtime, cell),
      });
    }
  }
  const present = actorsOnPlane(save.actors, plane.plane);
  const adjacent = orthogonalAdjacent(player, plane.wraps);
  const targeting = present
    .filter((actor) => actor.id !== "player" && (actor.kind === "monster" || actor.kind === "guardian"))
    .filter((actor) => adjacent.some((cell) => cell.x === actor.x && cell.y === actor.y))
    .map((actor) => ({ x: actor.x, y: actor.y }));
  return {
    plane: { a: plane.plane.a, b: plane.plane.b },
    family: save.family,
    wraps: plane.wraps,
    tick: save.tick,
    cells,
    actors: present.map((actor) => ({
      id: actor.id,
      definitionId: actor.definitionId,
      kind: actor.kind,
      x: actor.x,
      y: actor.y,
      hp: actor.hp,
      maxHp: actor.maxHp,
      visible: cellIsVisible(runtime, actor),
    })),
    items: groundItemsOnPlane(save, plane.plane)
      .filter((item) => cellIsVisible(runtime, item))
      .map((item) => ({ id: item.id, itemId: item.itemId, x: item.x, y: item.y })),
    targeting,
    effects: events.flatMap((event, index) => {
      const fx = effectFromEvent(runtime, event, index);
      return fx ? [fx] : [];
    }),
    visibilityProfileId: profile.id,
    visibilityRadius: profile.radius,
  };
}
