import type { IntentionalAction } from "../model/save-state";
import { actorsOnPlane } from "../rules/occupancy";
import { orthogonalAdjacent } from "../rules/targeting";
import { grantedAttackIds } from "../rules/actor-stats";
import { playerActor, type GameRuntime } from "../runtime/game-runtime";

export interface AvailableActions {
  readonly defaultAttack: IntentionalAction | null;
}

export function getAvailableActions(runtime: GameRuntime): AvailableActions {
  const save = runtime.save;
  const player = playerActor(runtime);
  const attackId = grantedAttackIds(save, player).find((id) => id !== "unarmed_strike") ?? grantedAttackIds(save, player)[0];
  if (!attackId) {
    return { defaultAttack: null };
  }
  const adjacent = orthogonalAdjacent(player, runtime.currentPlaneBase.wraps);
  const target = actorsOnPlane(save.actors, save.plane).find(
    (actor) =>
      (actor.kind === "monster" || actor.kind === "guardian") &&
      adjacent.some((cell) => cell.x === actor.x && cell.y === actor.y),
  );
  if (!target) {
    return { defaultAttack: null };
  }
  return {
    defaultAttack: {
      type: "attack",
      attackId,
      targetId: target.id,
      targetX: target.x,
      targetY: target.y,
    },
  };
}
