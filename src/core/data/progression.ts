import { GLOBAL_CONSTANTS } from "../model/constants";
import { STARTING_PLANE } from "../model/plane";

export const STARTING_PLAYER_STATE = {
  plane: STARTING_PLANE,
  discoveredDimensions: [0, 1] as const,
  discoveredPlanes: [STARTING_PLANE] as const,
  attributes: {
    str: GLOBAL_CONSTANTS.playerStartingAttribute,
    dex: GLOBAL_CONSTANTS.playerStartingAttribute,
    con: GLOBAL_CONSTANTS.playerStartingAttribute,
    spd: GLOBAL_CONSTANTS.playerStartingAttribute,
    wis: GLOBAL_CONSTANTS.playerStartingAttribute,
    int: GLOBAL_CONSTANTS.playerStartingAttribute,
    cha: GLOBAL_CONSTANTS.playerStartingAttribute,
    psy: GLOBAL_CONSTANTS.playerStartingAttribute,
  },
  unspentAp: 0,
  currentHp: 18,
  learnedAbilities: [] as const,
  currency: 0,
} as const;

export const PROGRESSION_TIERS = [
  { tier: 0, dimensions: [0, 1], family: "aboveground" },
  { tier: 1, dimensions: [2, 3], family: "inside" },
  { tier: 2, dimensions: [4, 5], family: "dungeon" },
  { tier: 3, dimensions: [6, 7], family: "arcane" },
  { tier: 4, dimensions: [8, 9], family: "ethereal" },
  { tier: 5, dimensions: [10, 11], family: "space" },
  { tier: 6, dimensions: [12, 13], family: "void" },
  { tier: 7, dimensions: [14, 15], family: "olympus" },
] as const;

export const VICTORY = {
  id: "olympus_victory",
  encounterId: "boss_olympus",
  plane: { a: 14, b: 15 },
  bossId: "olympian_final",
  actorId: "boss.boss_olympus",
  flagId: "victory",
  deadFlagId: "final_boss_dead",
  modalId: "victory",
} as const;

export const DEATH_RULES = {
  id: "player_death_v1",
  respawnAt: "safeAnchor",
  restoreHpToMax: true,
  clearActionQueue: true,
  clearHeldDirection: true,
  clearSpaceVelocity: true,
  cancelPursuitsInvolvingPlayer: true,
  clearPendingTransition: true,
  clearCooldowns: true,
  clearPendingExtraActions: true,
  clearRevealBonus: true,
  statusClearField: "clearedOnPlayerDeath",
} as const;

export const GENERATION_VERSIONS = [
  { id: "tight-v1", compatible: true },
] as const;
