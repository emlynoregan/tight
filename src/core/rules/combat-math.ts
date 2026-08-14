import { CHANNEL_MULTIPLIER, GLOBAL_CONSTANTS, RESISTANCE_MULTIPLIER } from "../model/constants";
import type { AttributeBlock } from "../model/content-types";
import type { AttributeId, ChannelStateId, ResistanceStateId } from "../model/ids";

export function governingStat(attributes: AttributeBlock, ids: readonly AttributeId[]): number {
  if (ids.length === 0) {
    return 0;
  }
  if (ids.length === 1) {
    return attributes[ids[0]!];
  }
  return Math.floor((attributes[ids[0]!] + attributes[ids[1]!]) / 2);
}

export function hitChancePercent(attackScore: number, defenceScore: number): number {
  const raw =
    GLOBAL_CONSTANTS.hitBaselinePercent + GLOBAL_CONSTANTS.hitScoreStepPercent * (attackScore - defenceScore);
  return Math.min(GLOBAL_CONSTANTS.hitChanceMaxPercent, Math.max(GLOBAL_CONSTANTS.hitChanceMinPercent, raw));
}

export function rawDamage(basePower: number, gov: number): number {
  return basePower + Math.floor(gov / 3);
}

export interface DamagePipelineInput {
  readonly basePower: number;
  readonly governingStat: number;
  readonly channelState: ChannelStateId;
  readonly resistance: ResistanceStateId;
  readonly armour: number;
  readonly effectModifier?: number;
}

export interface DamagePipelineResult {
  readonly raw: number;
  readonly afterChannel: number;
  readonly afterResistance: number;
  readonly afterArmour: number;
  readonly blocked: boolean;
  readonly immune: boolean;
  readonly final: number;
}

export function resolveDamagePipeline(input: DamagePipelineInput): DamagePipelineResult {
  const raw = rawDamage(input.basePower, input.governingStat);
  const afterChannel = Math.floor(raw * CHANNEL_MULTIPLIER[input.channelState]);
  const afterResistance = Math.floor(afterChannel * RESISTANCE_MULTIPLIER[input.resistance]);
  const afterArmour = afterResistance - input.armour;
  const blocked = input.channelState === "blocked";
  const immune = input.resistance === "immune";
  const effectModifier = input.effectModifier ?? 0;
  const final = blocked || immune ? 0 : Math.max(1, afterArmour + effectModifier);
  return { raw, afterChannel, afterResistance, afterArmour, blocked, immune, final };
}

export function resolveFlatDamage(amount: number, resistance: ResistanceStateId, armour: number): number {
  const afterResistance = Math.floor(amount * RESISTANCE_MULTIPLIER[resistance]);
  const afterArmour = afterResistance - armour;
  if (resistance === "immune") {
    return 0;
  }
  return Math.max(1, afterArmour);
}

const RESISTANCE_RANK: Record<ResistanceStateId, number> = {
  vulnerable: 0,
  normal: 1,
  resistant: 2,
  immune: 3,
};

export function strongerResistance(left: ResistanceStateId, right: ResistanceStateId): ResistanceStateId {
  return RESISTANCE_RANK[left] >= RESISTANCE_RANK[right] ? left : right;
}
