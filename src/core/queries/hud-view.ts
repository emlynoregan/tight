import { CONTENT_REGISTRY } from "../data/registry";
import { DIMENSION_COUNT, type PlanePair } from "../model/plane";
import type { Direction } from "../model/save-state";
import { actorsOnPlane, featureAt, featureIsInteractive } from "../rules/occupancy";
import { orthogonalAdjacent } from "../rules/targeting";
import { grantedAttackIds } from "../rules/actor-stats";
import { playerActor, type GameRuntime } from "../runtime/game-runtime";
import type { TickEvent } from "../rules/tick-events";

export type GemState = "unknown" | "known" | "current";

export interface GemView {
  readonly dimension: number;
  readonly name: string;
  readonly state: GemState;
}

export interface StatusView {
  readonly id: string;
  readonly name: string;
  readonly remainingTicks: number | "until_broken";
}

export interface HudView {
  readonly hp: number;
  readonly maxHp: number;
  readonly plane: PlanePair;
  readonly family: string;
  readonly tick: number;
  readonly statuses: readonly StatusView[];
  readonly gems: readonly GemView[];
  readonly messages: readonly string[];
  readonly actionHints: readonly string[];
  readonly modal: string | null;
  readonly heldDirection: Direction | null;
  readonly queueLength: number;
}

export function formatTickEvent(event: TickEvent): string | null {
  switch (event.type) {
    case "actor_moved":
      return event.actorId === "player" ? `Moved to ${event.x},${event.y}` : null;
    case "action_waited":
      return event.actorId === "player" ? "Waited" : null;
    case "action_failed":
      return event.actorId === "player" ? `Failed: ${event.detail ?? "blocked"}` : null;
    case "attack_hit":
      return `${event.actorId ?? "attacker"} hits ${event.targetId ?? "target"}`;
    case "attack_miss":
      return `${event.actorId ?? "attacker"} misses ${event.targetId ?? "target"}`;
    case "damage_taken":
      return `${event.actorId ?? "actor"} takes ${event.amount ?? 0}`;
    case "healed":
      return `${event.actorId ?? "actor"} heals ${event.amount ?? 0}`;
    case "door_toggled":
      return `Door ${event.detail ?? "toggled"}`;
    case "interacted":
      return `Interacted with ${event.targetId ?? "feature"}`;
    case "transition_activated":
      return `Transition to ${event.detail ?? "another plane"}`;
    case "dimension_discovered":
      return `Discovered dimension ${event.amount ?? "?"}`;
    case "plane_visited":
      return `Arrived on ${event.detail ?? "plane"}`;
    case "monster_died":
      return `${event.actorId ?? "monster"} died`;
    case "player_died":
      return "You died";
    case "player_respawned":
      return "Respawned at Safe Anchor";
    case "pursuit_started":
      return "Something followed";
    case "pursuit_arrived":
      return `${event.actorId ?? "pursuer"} arrived`;
    case "pursuit_cancelled":
      return null;
    case "status_applied":
      return `${event.actorId ?? "actor"}: ${event.detail ?? "status"}`;
    case "item_picked_up":
      return `Picked up ${event.detail ?? "item"}`;
    case "item_dropped":
      return `Dropped ${event.detail ?? "item"}`;
    case "item_used":
      return `Used ${event.detail ?? "item"}`;
    case "paused":
      return `Paused (${event.detail ?? "modal"})`;
    default:
      return event.actorId === "player" ? event.type.replaceAll("_", " ") : null;
  }
}

export function getHudView(runtime: GameRuntime, messages: readonly string[] = []): HudView {
  const save = runtime.save;
  const player = playerActor(runtime);
  const discovered = new Set(save.discoveredDimensions);
  const gems: GemView[] = [];
  for (let dimension = 0; dimension < DIMENSION_COUNT; dimension += 1) {
    const def = CONTENT_REGISTRY.byId.dimension.get(dimension);
    let state: GemState = "unknown";
    if (save.plane.a === dimension || save.plane.b === dimension) {
      state = "current";
    } else if (discovered.has(dimension)) {
      state = "known";
    }
    gems.push({
      dimension,
      name: def?.name ?? `D${dimension}`,
      state,
    });
  }
  const adjacent = orthogonalAdjacent(player, runtime.currentPlaneBase.wraps);
  const neighbours = [{ x: player.x, y: player.y }, ...adjacent];
  const canInteract = neighbours.some((cell) => {
    const featureId = featureAt(runtime.currentPlaneBase, cell);
    if (featureIsInteractive(featureId)) {
      return true;
    }
    return actorsOnPlane(save.actors, save.plane).some(
      (actor) => actor.id !== "player" && actor.x === cell.x && actor.y === cell.y && (actor.kind === "npc" || actor.kind === "guardian"),
    );
  });
  const canAttack = actorsOnPlane(save.actors, save.plane).some(
    (actor) =>
      (actor.kind === "monster" || actor.kind === "guardian") &&
      adjacent.some((cell) => cell.x === actor.x && cell.y === actor.y),
  );
  const attackId = grantedAttackIds(save, player).find((id) => id !== "unarmed_strike") ?? "unarmed_strike";
  const hints = [
    "Arrows/WASD move (hold to keep walking)",
    "Space/. wait",
    canInteract ? "E interact" : "E interact (nothing adjacent)",
    canAttack ? `F attack (${attackId})` : "F attack (need adjacent foe)",
    "G pick up  I inventory  C character",
    save.modal ? "Esc close modal" : null,
  ].filter((row): row is string => row !== null);
  return {
    hp: player.hp,
    maxHp: player.maxHp,
    plane: { a: save.plane.a, b: save.plane.b },
    family: save.family,
    tick: save.tick,
    statuses: player.statuses.map((instance) => ({
      id: instance.id,
      name: CONTENT_REGISTRY.byId.status.get(instance.id)?.name ?? instance.id,
      remainingTicks: instance.remainingTicks,
    })),
    gems,
    messages,
    actionHints: hints,
    modal: save.modal,
    heldDirection: save.heldDirection,
    queueLength: save.actionQueue.length,
  };
}
