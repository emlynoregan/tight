import type { PlanePair } from "../core/model/plane";

export type OscillatorKind = "sine" | "square" | "sawtooth" | "triangle" | "noise";

export type SynthEffect = "none" | "delay" | "crackle";

export interface SynthPatch {
  readonly source: OscillatorKind;
  readonly frequencyHz: number;
  readonly endFrequencyHz: number;
  readonly durationMs: number;
  readonly attackMs: number;
  readonly decayMs: number;
  readonly filterHz: number;
  readonly gain: number;
  readonly effect: SynthEffect;
}

export interface NoteEvent {
  readonly step: number;
  readonly pitch: number;
  readonly durationSteps: number;
  readonly velocity: number;
  readonly voiceId: "bass" | "motif";
}

export interface MusicVoice {
  readonly id: "bass" | "motif";
  readonly oscillator: OscillatorKind;
  readonly filterHz: number;
  readonly gain: number;
}

export interface MusicProfile {
  readonly id: string;
  readonly dimension: number;
  readonly secondaryDimension: number | null;
  readonly name: string;
  readonly tempo: number;
  readonly meter: number;
  readonly steps: number;
  readonly scale: readonly number[];
  readonly root: number;
  readonly chordLoop: readonly number[];
  readonly bassPattern: readonly number[];
  readonly motifPattern: readonly number[];
  readonly rhythmMask: readonly boolean[];
  readonly voices: readonly MusicVoice[];
  readonly notes: readonly NoteEvent[];
}

export interface AudioPreferences {
  readonly enabled: boolean;
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
}

export interface MusicRequest {
  readonly plane?: PlanePair;
  readonly dimension?: number;
  readonly family?: string;
}

export interface MusicHandle {
  readonly id: string;
  readonly silent: boolean;
  readonly profile: MusicProfile | null;
}

export interface AudioCueEquivalent {
  readonly visualId?: string;
  readonly text: string;
}
