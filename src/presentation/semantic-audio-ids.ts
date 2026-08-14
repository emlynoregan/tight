import { COMBAT_FEEDBACK } from "../core/data/presentation";
import { enumeratePlanes } from "../core/model/plane";
import { compareStableIds } from "../core/generation/semantic-random";
import type { AudioCueEquivalent } from "./audio-types";

export interface SfxDefinition {
  readonly id: string;
  readonly equivalent: AudioCueEquivalent;
}

export const SFX_CUES: readonly SfxDefinition[] = [
  { id: "sfx.ui.confirm", equivalent: { visualId: "ui.Plane", text: "confirm" } },
  { id: "sfx.ui.cancel", equivalent: { visualId: "ui.Blocked", text: "cancel" } },
  { id: "sfx.move.footstep", equivalent: { visualId: "tile.grass", text: "step" } },
  { id: "sfx.combat.impact", equivalent: { visualId: "effect.fb_hit", text: "hit" } },
  { id: "sfx.combat.miss", equivalent: { visualId: "effect.fb_miss", text: "miss" } },
  { id: "sfx.combat.projectile", equivalent: { visualId: "effect.fb_hit", text: "projectile" } },
  { id: "sfx.item.pickup", equivalent: { visualId: "item.sword", text: "picked up" } },
  { id: "sfx.item.use", equivalent: { visualId: "item.healing_herb", text: "used item" } },
  { id: "sfx.item.heal", equivalent: { visualId: "status.regenerating", text: "healing" } },
  { id: "sfx.status.poison", equivalent: { visualId: "status.poisoned", text: "poison" } },
  { id: "sfx.status.fire", equivalent: { visualId: "status.burning", text: "fire" } },
  { id: "sfx.status.arcane", equivalent: { visualId: "status.ward_arcane", text: "arcane" } },
  { id: "sfx.status.psychic", equivalent: { visualId: "status.ward_psychic", text: "psychic" } },
  { id: "sfx.status.void", equivalent: { visualId: "status.ward_void", text: "void" } },
  { id: "sfx.status.divine", equivalent: { visualId: "status.ward_divine", text: "divine" } },
  { id: "sfx.feature.door", equivalent: { visualId: "feature.door", text: "door" } },
  { id: "sfx.feature.safe_anchor", equivalent: { visualId: "feature.safe_anchor", text: "Safe Anchor" } },
  { id: "sfx.transition.activate", equivalent: { visualId: "feature.transition_fixture", text: "transition" } },
  { id: "sfx.transition.portal", equivalent: { visualId: "effect.pursuit_source_react", text: "portal" } },
  { id: "sfx.discovery", equivalent: { visualId: "gem.0.known", text: "dimension discovered" } },
  { id: "sfx.death", equivalent: { visualId: "effect.fb_death", text: "death" } },
  { id: "sfx.victory", equivalent: { text: "Olympus conquered." } },
  { id: "sfx.pursuit.source", equivalent: { visualId: "effect.pursuit_source_react", text: "something followed" } },
  { id: "sfx.pursuit.arrival", equivalent: { visualId: "effect.pursuit_arrival", text: "followed you" } },
  ...COMBAT_FEEDBACK.filter((id) => !["fb_hit", "fb_miss", "fb_death"].includes(id)).map((id) => ({
    id: `sfx.combat.${id}`,
    equivalent: { visualId: `effect.${id}`, text: id.replace("fb_", "").replaceAll("_", " ") },
  })),
];

export function sfxKey(id: string): string {
  return id.startsWith("sfx.") ? id : `sfx.${id}`;
}

export function musicDimensionKey(dimension: number): string {
  return `music.dimension.${dimension}`;
}

export function musicPlaneKey(a: number, b: number): string {
  return `music.plane.${a}.${b}`;
}

export function requiredSfxKeys(): readonly string[] {
  return [...new Set(SFX_CUES.map((row) => row.id))].sort(compareStableIds);
}

export function requiredMusicKeys(): readonly string[] {
  const keys = Array.from({ length: 16 }, (_, dimension) => musicDimensionKey(dimension));
  for (const plane of enumeratePlanes()) {
    keys.push(musicPlaneKey(plane.a, plane.b));
  }
  return keys.sort(compareStableIds);
}

export function requiredAudioKeys(): readonly string[] {
  return [...requiredSfxKeys(), ...requiredMusicKeys()].sort(compareStableIds);
}

export function equivalentFor(semanticId: string): AudioCueEquivalent | null {
  return SFX_CUES.find((row) => row.id === semanticId)?.equivalent ?? null;
}
