import type { NpcArchetype } from "../model/content-types";
import type { PlanePair } from "../model/plane";

export function planeEligibleForArchetype(plane: PlanePair, archetype: NpcArchetype): boolean {
  return dimensionInRange(plane.a, archetype) || dimensionInRange(plane.b, archetype);
}

function dimensionInRange(dimension: number, archetype: NpcArchetype): boolean {
  return dimension >= archetype.dimensionMin && dimension <= archetype.dimensionMax;
}
