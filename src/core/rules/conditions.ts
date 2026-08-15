import { itemQuantity } from "./inventory";
import type { ConditionExpr } from "../model/conditions";
import type { GameRuntime } from "../runtime/game-runtime";
import { questState } from "./quests";

export function evaluateCondition(runtime: GameRuntime, expr: ConditionExpr): boolean {
  switch (expr.type) {
    case "all":
      return expr.of.every((child) => evaluateCondition(runtime, child));
    case "any":
      return expr.of.some((child) => evaluateCondition(runtime, child));
    case "not":
      return !evaluateCondition(runtime, expr.of);
    case "flag": {
      const present = runtime.save.flags.includes(expr.flag);
      return expr.equals ? present : !present;
    }
    case "questState":
      return questState(runtime.save, expr.questId) === expr.state;
    case "itemOwned": {
      const owned = itemQuantity(runtime.save, expr.itemId) > 0;
      return expr.owned ? owned : !owned;
    }
    case "currencyAtLeast":
      return runtime.save.player.currency >= expr.amount;
    case "dimensionDiscovered":
      return runtime.save.discoveredDimensions.includes(expr.dimension);
    case "planeDiscovered":
      return runtime.save.discoveredPlanes.some((plane) => plane.a === expr.plane.a && plane.b === expr.plane.b);
    case "entityDefeated":
      return runtime.save.flags.includes(`defeated:${expr.entityId}`);
    case "attributeAtLeast":
      return (runtime.save.player.attributes[expr.attribute] ?? 0) >= expr.value;
    case "currentPlane":
      return runtime.save.plane.a === expr.plane.a && runtime.save.plane.b === expr.plane.b;
    case "featureState":
      return runtime.save.featureStates.some((row) => row.state === expr.state);
    default:
      return false;
  }
}
