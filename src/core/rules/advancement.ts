import { GLOBAL_CONSTANTS } from "../model/constants";
import type { AttributeId } from "../model/ids";
import { planesEqual } from "../model/plane";
import { manhattanOnPlane } from "../generation/grid";
import { playerActor, type GameRuntime } from "../runtime/game-runtime";
import { featureAt } from "./occupancy";
import { syncDerivedMaxHp } from "./actor-stats";

const ATTRIBUTES: readonly AttributeId[] = ["str", "dex", "con", "spd", "wis", "int", "cha", "psy"];

export function isAttributeId(value: string): value is AttributeId {
  return (ATTRIBUTES as readonly string[]).includes(value);
}

export function playerAtSafeAnchor(runtime: GameRuntime): boolean {
  const player = playerActor(runtime);
  const anchor = runtime.save.player.safeAnchor;
  if (!planesEqual(player.plane, anchor.plane) || !planesEqual(runtime.save.plane, anchor.plane)) {
    return false;
  }
  if (manhattanOnPlane(player, anchor, runtime.currentPlaneBase.wraps) > 1) {
    return false;
  }
  return featureAt(runtime.currentPlaneBase, anchor) === "safe_anchor" || manhattanOnPlane(player, anchor, runtime.currentPlaneBase.wraps) === 0;
}

export function spendAdvancementPoint(
  runtime: GameRuntime,
  attribute: AttributeId,
): { ok: true } | { ok: false; message: string } {
  if (!playerAtSafeAnchor(runtime)) {
    return { ok: false, message: "must be at a safe anchor" };
  }
  const player = runtime.save.player;
  if (player.unspentAp < 1) {
    return { ok: false, message: "no unspent AP" };
  }
  const current = player.attributes[attribute];
  if (current >= GLOBAL_CONSTANTS.permanentAttributeCap) {
    return { ok: false, message: "attribute already at cap" };
  }
  player.unspentAp -= 1;
  player.attributes[attribute] = current + 1;
  syncDerivedMaxHp(runtime.save, playerActor(runtime));
  return { ok: true };
}
