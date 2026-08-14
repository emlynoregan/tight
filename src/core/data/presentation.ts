import type { PresentationStatus } from "../model/content-types";
import { DIMENSIONS } from "./dimensions";
import { STATUSES } from "./effects";
import { TRANSITION_ARCHETYPES } from "./transitions";

export const GEMSTONE_STATES = [
  { id: "gem_unknown", meaning: "dimension never visited" },
  { id: "gem_known", meaning: "dimension visited, not current" },
  { id: "gem_current", meaning: "one of current plane dimensions" },
] as const;

export const COLLISION_READABILITY = [
  "walkable_plain",
  "walkable_hazard",
  "blocked_solid",
  "interactive_blocked",
  "transition_usable",
  "transition_broken",
] as const;

export const COMBAT_FEEDBACK = [
  "fb_miss",
  "fb_hit",
  "fb_blocked",
  "fb_suppressed",
  "fb_empowered",
  "fb_resistant",
  "fb_vulnerable",
  "fb_status",
  "fb_death",
  "fb_invalid_action",
] as const;

export const STATUS_PRESENTATION: readonly PresentationStatus[] = STATUSES.map((status) => ({
  id: status.id,
  label: status.name,
}));

export const TRANSITION_PRESENTATION_KEYS = TRANSITION_ARCHETYPES.flatMap((archetype) => [
  `${archetype.id}_intact`,
  ...(archetype.brokenVariant ? [`${archetype.id}_broken`] : []),
  `${archetype.id}_activate`,
  `${archetype.id}_arrive`,
]);

export const UI_STRINGS = [
  "Plane",
  "Dimension",
  "Transition",
  "Ability",
  "Status",
  "Blocked",
  "Suppressed",
  "Normal",
  "Empowered",
  "Vulnerable",
  "Resistant",
  "Immune",
  "Advancement Point",
  "Safe Anchor",
  "World Seed",
  "Generator Version",
] as const;

export const DIMENSION_PRESENTATION = DIMENSIONS.map((dimension) => ({
  id: dimension.id,
  gemIdentity: dimension.gemIdentity,
  paletteMotif: dimension.paletteMotif,
  audioMotif: dimension.audioMotif,
}));
