import type { HazardDefinition, VisibilityProfile } from "../model/content-types";

export const VISIBILITY_PROFILES: readonly VisibilityProfile[] = [
  { id: "clear", radius: "unlimited" },
  { id: "dim", radius: 6 },
  { id: "dark", radius: 4 },
  { id: "void", radius: 3 },
  { id: "blinded", radius: 1 },
];

export const PROTECTION_TAGS = [
  "vacuumProtected",
  "fireProtected",
  "poisonProtected",
  "etherealProtected",
  "voidProtected",
  "divineProtected",
] as const;

export const HAZARDS: readonly HazardDefinition[] = [
  { id: "lava", triggers: ["onEnter", "onEndTick"], effectIds: ["damage_fire_5"], protectionTag: "fireProtected", visible: true, consumed: false },
  { id: "burning_ground", triggers: ["onEnter", "onLeave"], effectIds: ["damage_fire_2", "apply_burning"], protectionTag: "fireProtected", visible: true, consumed: false },
  { id: "poison_ground", triggers: ["onEnter"], effectIds: ["apply_poisoned"], protectionTag: "poisonProtected", visible: true, consumed: false },
  { id: "spikes", triggers: ["onEnter", "onInteract"], effectIds: ["damage_physical_4"], protectionTag: null, visible: true, consumed: false },
  { id: "hidden_spikes", triggers: ["onEnter", "onInteract"], effectIds: ["damage_physical_4"], protectionTag: null, visible: false, consumed: true },
  { id: "arcane_field", triggers: ["onEndTick"], effectIds: ["damage_arcane_3"], protectionTag: null, visible: true, consumed: false },
  { id: "spectral_field", triggers: ["onEndTick"], effectIds: ["damage_ethereal_3"], protectionTag: "etherealProtected", visible: true, consumed: false },
  { id: "vacuum", triggers: ["onEndTick"], effectIds: ["damage_environmental_3"], protectionTag: "vacuumProtected", visible: true, consumed: false },
  { id: "void_corruption", triggers: ["onEndTick"], effectIds: ["damage_void_3"], protectionTag: "voidProtected", visible: true, consumed: false },
  { id: "void_confusion", triggers: ["onEnter"], effectIds: ["apply_confused"], protectionTag: "voidProtected", visible: false, consumed: false },
  { id: "divine_field", triggers: ["onEndTick"], effectIds: ["damage_divine_4"], protectionTag: "divineProtected", visible: true, consumed: false },
];

export const DOOR_DEFINITIONS = [
  { id: "door_plain", initialState: "closed", requirement: null },
  { id: "door_locked_key", initialState: "locked", requirement: "key" },
  { id: "door_guardian", initialState: "locked", requirement: "guardian_flag" },
  { id: "door_arcane", initialState: "locked", requirement: "ability_or_flag" },
  { id: "door_divine", initialState: "locked", requirement: "divine_route_flag" },
] as const;

export const LOS_BLOCKING_TAGS = ["wall", "solid_tree", "closed_door", "large_rock", "opaque_structure"] as const;
