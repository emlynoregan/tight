import type { GeneratorVersionId } from "./ids";

export const GLOBAL_CONSTANTS = {
  dimensionCount: 16,
  mapWidth: 16,
  mapHeight: 16,
  planeCount: 120,
  simulationHz: 1,
  inputQueueCapacity: 2,
  ordinaryMovementStep: 1,
  spaceVelocityComponentMin: -2,
  spaceVelocityComponentMax: 2,
  pursuitEligibilityRadius: 6,
  ordinaryInventorySlots: 12,
  defaultStackSize: 9,
  playerStartingAttribute: 4,
  permanentAttributeCap: 15,
  maxTopologyAttempts: 4096,
  hitBaselinePercent: 60,
  hitScoreStepPercent: 5,
  hitChanceMinPercent: 20,
  hitChanceMaxPercent: 95,
  baseHpConstant: 10,
  hpPerCon: 2,
  generatorVersion: "tight-v1" as GeneratorVersionId,
} as const;

export type GlobalConstants = typeof GLOBAL_CONSTANTS;

export const CHANNEL_MULTIPLIER = {
  blocked: 0,
  suppressed: 0.5,
  normal: 1,
  empowered: 1.5,
} as const;

export const RESISTANCE_MULTIPLIER = {
  immune: 0,
  resistant: 0.5,
  normal: 1,
  vulnerable: 1.5,
} as const;

export const ATTRIBUTES = [
  { id: "str", name: "Strength" },
  { id: "dex", name: "Dexterity" },
  { id: "con", name: "Constitution" },
  { id: "spd", name: "Speed" },
  { id: "wis", name: "Wisdom" },
  { id: "int", name: "Intelligence" },
  { id: "cha", name: "Charisma" },
  { id: "psy", name: "Psyche" },
] as const;
