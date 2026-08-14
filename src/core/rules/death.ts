import { compareStableIds } from "../generation/semantic-random";
import type { ActorState, SaveState } from "../model/save-state";
import { CONTENT_REGISTRY } from "../data/registry";
import type { TickEvent } from "./tick-events";

const NEGATIVE_CLEARED_ON_DEATH = (statusId: string): boolean =>
  CONTENT_REGISTRY.byId.status.get(statusId)?.clearedOnPlayerDeath === true;

export function resolveDeaths(save: SaveState, events: TickEvent[]): void {
  const doomed = save.actors.filter((actor) => actor.hp <= 0).sort((left, right) => compareStableIds(left.id, right.id));
  for (const actor of doomed) {
    if (actor.kind === "player") {
      resolvePlayerDeath(save, actor, events);
      continue;
    }
    save.actors = save.actors.filter((row) => row.id !== actor.id);
    events.push({ type: "monster_died", actorId: actor.id });
  }
}

function resolvePlayerDeath(save: SaveState, actor: ActorState, events: TickEvent[]): void {
  events.push({ type: "player_died", actorId: actor.id });
  const anchor = save.player.safeAnchor;
  actor.plane = { ...anchor.plane };
  actor.x = anchor.x;
  actor.y = anchor.y;
  actor.hp = actor.maxHp;
  actor.statuses = actor.statuses.filter((instance) => {
    if (NEGATIVE_CLEARED_ON_DEATH(instance.id)) {
      events.push({ type: "status_removed", actorId: actor.id, detail: instance.id });
      return false;
    }
    return true;
  });
  actor.cooldowns = [];
  save.plane = { ...anchor.plane };
  events.push({ type: "player_respawned", actorId: actor.id, x: actor.x, y: actor.y });
}
