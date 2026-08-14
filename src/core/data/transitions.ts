import type { TransitionArchetype } from "../model/content-types";

export const TRANSITION_ACTIVATION_MODES = ["step_on", "interact", "edge_cross"] as const;
export const COORDINATE_MODES = ["fixed", "source_axis_copy", "deterministic_derived"] as const;
export const PURSUIT_CATEGORIES = [
  "mundane_passage",
  "climb",
  "fall",
  "water",
  "arcane",
  "ethereal",
  "space",
  "void",
  "divine",
] as const;
export const PURSUIT_SPEEDS = [
  { id: "immediate", delay: 1 },
  { id: "normal", delay: 2 },
  { id: "slow", delay: 3 },
] as const;
export const PURSUIT_MODES = ["follow_same_transition", "phase_to_arrival", "emerge_adjacent"] as const;
export const ARRIVAL_RULES = ["exact", "exact_or_fail", "adjacent_nesw", "nearest_legal"] as const;
export const TRANSITION_EFFECT_PROFILE_ROWS = [
  { id: "fixed_gate", coordinateMode: "fixed", pursuit: true },
  { id: "copied_gate", coordinateMode: "source_axis_copy", pursuit: true },
  { id: "derived_gate", coordinateMode: "deterministic_derived", pursuit: true },
  { id: "fixed_no_pursuit", coordinateMode: "fixed", pursuit: false },
  { id: "derived_no_pursuit", coordinateMode: "deterministic_derived", pursuit: false },
  { id: "return_previous", coordinateMode: "return_previous", pursuit: false },
] as const;

export const TRANSITION_EFFECT_PROFILES = TRANSITION_EFFECT_PROFILE_ROWS.map((row) => row.id);

export const TRANSITION_ARCHETYPES: readonly TransitionArchetype[] = [
  { id: "door", activation: "interact", pursuitCategory: "mundane_passage", brokenVariant: "blocked doorway", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "stairs", activation: "interact", pursuitCategory: "mundane_passage", brokenVariant: "collapsed stairs", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "ladder", activation: "interact", pursuitCategory: "climb", brokenVariant: "collapsed ladder", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "hole", activation: "step_on", pursuitCategory: "fall", brokenVariant: "sealed hole", defaultCoordinateMode: "source_axis_copy", pursuitAllowed: true, singleUseDefault: true, forcedActivation: true },
  { id: "well", activation: "interact", pursuitCategory: "fall", brokenVariant: "dry/sealed well", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "elevator", activation: "interact", pursuitCategory: "mundane_passage", brokenVariant: "jammed elevator", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "cave_mouth", activation: "interact", pursuitCategory: "mundane_passage", brokenVariant: "cave-in", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "mirror", activation: "interact", pursuitCategory: "arcane", brokenVariant: "cracked mirror", defaultCoordinateMode: "deterministic_derived", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "portal", activation: "interact", pursuitCategory: "arcane", brokenVariant: "dead portal", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "magic_circle", activation: "step_on", pursuitCategory: "arcane", brokenVariant: "inert circle", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: true },
  { id: "rift", activation: "interact", pursuitCategory: "arcane", brokenVariant: "sealed rift", defaultCoordinateMode: "deterministic_derived", pursuitAllowed: true, singleUseDefault: true, forcedActivation: false },
  { id: "whirlpool", activation: "step_on", pursuitCategory: "water", brokenVariant: "still/blocked pool", defaultCoordinateMode: "deterministic_derived", pursuitAllowed: true, singleUseDefault: false, forcedActivation: true },
  { id: "airlock", activation: "interact", pursuitCategory: "space", brokenVariant: "jammed airlock", defaultCoordinateMode: "fixed", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "wormhole", activation: "step_on", pursuitCategory: "space", brokenVariant: "collapsed wormhole", defaultCoordinateMode: "deterministic_derived", pursuitAllowed: true, singleUseDefault: false, forcedActivation: true },
  { id: "grave", activation: "interact", pursuitCategory: "ethereal", brokenVariant: "silent grave", defaultCoordinateMode: "deterministic_derived", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
  { id: "dimensional_tear", activation: "interact", pursuitCategory: "ethereal", brokenVariant: "closed tear", defaultCoordinateMode: "deterministic_derived", pursuitAllowed: true, singleUseDefault: true, forcedActivation: false },
  { id: "map_edge_passage", activation: "edge_cross", pursuitCategory: "ethereal", brokenVariant: null, defaultCoordinateMode: "deterministic_derived", pursuitAllowed: true, singleUseDefault: false, forcedActivation: false },
];

export const ETHEREAL_EDGE_MAPPING = {
  north: 12,
  east: 13,
  south: 12,
  west: 13,
} as const;
