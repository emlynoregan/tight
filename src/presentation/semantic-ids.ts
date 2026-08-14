import { COMBAT_FEEDBACK, GEMSTONE_STATES, TRANSITION_PRESENTATION_KEYS, UI_STRINGS } from "../core/data/presentation";
import type { ContentRegistry } from "../core/data/registry";
import { compareStableIds } from "../core/generation/semantic-random";

export function tileKey(id: string): string {
  return `tile.${id}`;
}

export function featureKey(id: string, state?: string): string {
  return state ? `feature.${id}.${state}` : `feature.${id}`;
}

export function actorPlayerKey(): string {
  return "actor.player";
}

export function npcKey(id: string): string {
  return `npc.${id}`;
}

export function monsterKey(id: string): string {
  return `monster.${id}`;
}

export function itemKey(id: string): string {
  return `item.${id}`;
}

export function statusKey(id: string): string {
  return `status.${id}`;
}

export function abilityKey(id: string): string {
  return `ability.${id}`;
}

export function transitionKey(id: string): string {
  return `transition.${id}`;
}

export function gemKey(dimension: number, state: "unknown" | "known" | "current"): string {
  return `gem.${dimension}.${state}`;
}

export function effectKey(id: string): string {
  return `effect.${id}`;
}

export function hazardKey(id: string): string {
  return `hazard.${id}`;
}

export function visibilityKey(id: string): string {
  return `visibility.${id}`;
}

export function uiKey(label: string): string {
  return `ui.${label.replaceAll(" ", "_")}`;
}

const DOOR_STATES = ["closed", "open", "locked"] as const;
const GEM_STATES = ["unknown", "known", "current"] as const;

export function requiredVisualKeys(registry: ContentRegistry): readonly string[] {
  const keys: string[] = [actorPlayerKey()];
  for (const tile of registry.tileTypes) {
    keys.push(tileKey(tile.id));
  }
  for (const feature of registry.staticFeatures) {
    keys.push(featureKey(feature.id));
    if (feature.id === "door") {
      for (const state of DOOR_STATES) {
        keys.push(featureKey("door", state));
      }
    }
  }
  for (const npc of registry.npcArchetypes) {
    keys.push(npcKey(npc.id));
  }
  for (const npc of registry.storyNpcs) {
    keys.push(npcKey(npc.id));
  }
  for (const monster of registry.monsters) {
    keys.push(monsterKey(monster.id));
  }
  for (const item of registry.items) {
    keys.push(itemKey(item.id));
  }
  for (const status of registry.statuses) {
    keys.push(statusKey(status.id));
  }
  for (const ability of registry.abilities) {
    keys.push(abilityKey(ability.id));
  }
  for (const key of TRANSITION_PRESENTATION_KEYS) {
    keys.push(transitionKey(key));
  }
  for (let dimension = 0; dimension < 16; dimension += 1) {
    for (const state of GEM_STATES) {
      keys.push(gemKey(dimension, state));
    }
  }
  for (const feedback of COMBAT_FEEDBACK) {
    keys.push(effectKey(feedback));
  }
  keys.push(effectKey("pursuit_source_react"), effectKey("pursuit_arrival"));
  for (const hazard of registry.hazards) {
    keys.push(hazardKey(hazard.id));
  }
  for (const profile of registry.visibilityProfiles) {
    keys.push(visibilityKey(profile.id));
  }
  for (const label of UI_STRINGS) {
    keys.push(uiKey(label));
  }
  for (const gem of GEMSTONE_STATES) {
    keys.push(`ui.${gem.id}`);
  }
  return [...new Set(keys)].sort(compareStableIds);
}
