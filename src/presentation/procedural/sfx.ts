import type { OscillatorKind, SynthPatch } from "../audio-types";
import { requiredSfxKeys } from "../semantic-audio-ids";

function patch(
  source: OscillatorKind,
  frequencyHz: number,
  endFrequencyHz: number,
  durationMs: number,
  extras: Partial<Pick<SynthPatch, "attackMs" | "decayMs" | "filterHz" | "gain" | "effect">> = {},
): SynthPatch {
  return {
    source,
    frequencyHz,
    endFrequencyHz,
    durationMs,
    attackMs: extras.attackMs ?? 8,
    decayMs: extras.decayMs ?? Math.max(40, durationMs - 12),
    filterHz: extras.filterHz ?? 2400,
    gain: extras.gain ?? 0.22,
    effect: extras.effect ?? "none",
  };
}

const PATCHES: Record<string, SynthPatch> = {
  "sfx.ui.confirm": patch("sine", 660, 880, 120, { gain: 0.18 }),
  "sfx.ui.cancel": patch("sine", 440, 280, 110, { gain: 0.16 }),
  "sfx.move.footstep": patch("noise", 180, 140, 70, { filterHz: 900, gain: 0.12, effect: "crackle" }),
  "sfx.combat.impact": patch("noise", 220, 90, 140, { filterHz: 800, gain: 0.28 }),
  "sfx.combat.miss": patch("noise", 900, 1400, 90, { filterHz: 3200, gain: 0.1 }),
  "sfx.combat.projectile": patch("sawtooth", 720, 280, 160, { filterHz: 1800, gain: 0.14 }),
  "sfx.item.pickup": patch("sine", 520, 780, 180, { gain: 0.16 }),
  "sfx.item.use": patch("triangle", 400, 520, 140, { gain: 0.15 }),
  "sfx.item.heal": patch("sine", 392, 523, 280, { gain: 0.18 }),
  "sfx.status.poison": patch("square", 180, 160, 220, { filterHz: 700, gain: 0.12, effect: "crackle" }),
  "sfx.status.fire": patch("noise", 300, 220, 200, { filterHz: 1600, gain: 0.2, effect: "crackle" }),
  "sfx.status.arcane": patch("sine", 880, 1320, 200, { gain: 0.16 }),
  "sfx.status.psychic": patch("sine", 510, 505, 320, { gain: 0.14 }),
  "sfx.status.void": patch("sawtooth", 110, 55, 280, { filterHz: 400, gain: 0.18 }),
  "sfx.status.divine": patch("sine", 523, 784, 340, { gain: 0.2 }),
  "sfx.feature.door": patch("noise", 140, 90, 150, { filterHz: 600, gain: 0.18 }),
  "sfx.feature.safe_anchor": patch("sine", 392, 494, 360, { gain: 0.2 }),
  "sfx.transition.activate": patch("sawtooth", 240, 480, 260, { filterHz: 1200, gain: 0.2 }),
  "sfx.transition.portal": patch("triangle", 200, 640, 420, { filterHz: 1400, gain: 0.18, effect: "delay" }),
  "sfx.discovery": patch("sine", 440, 880, 400, { gain: 0.2 }),
  "sfx.death": patch("triangle", 220, 80, 500, { gain: 0.16 }),
  "sfx.victory": patch("square", 392, 784, 900, { gain: 0.22, effect: "delay" }),
  "sfx.pursuit.source": patch("triangle", 180, 240, 180, { gain: 0.1 }),
  "sfx.pursuit.arrival": patch("sawtooth", 160, 320, 280, { gain: 0.2 }),
  "sfx.combat.fb_blocked": patch("square", 200, 160, 120, { gain: 0.16 }),
  "sfx.combat.fb_suppressed": patch("sine", 300, 180, 160, { gain: 0.12 }),
  "sfx.combat.fb_empowered": patch("sawtooth", 480, 720, 180, { gain: 0.18 }),
  "sfx.combat.fb_resistant": patch("triangle", 260, 200, 140, { gain: 0.14 }),
  "sfx.combat.fb_vulnerable": patch("square", 640, 420, 140, { gain: 0.16 }),
  "sfx.combat.fb_status": patch("sine", 360, 480, 180, { gain: 0.14 }),
  "sfx.combat.fb_invalid_action": patch("square", 180, 140, 90, { gain: 0.12 }),
};

export function sfxPatch(semanticId: string): SynthPatch | undefined {
  return PATCHES[semanticId];
}

export function assertSfxCoverage(): void {
  for (const id of requiredSfxKeys()) {
    if (!PATCHES[id]) {
      throw new Error(`missing sfx patch: ${id}`);
    }
  }
}
