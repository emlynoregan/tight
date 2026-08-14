import { DIMENSIONS } from "../../core/data/dimensions";
import { canonicalizePlane, type PlanePair } from "../../core/model/plane";
import type { MusicProfile, MusicVoice, NoteEvent, OscillatorKind } from "../audio-types";
import { musicDimensionKey, musicPlaneKey } from "../semantic-audio-ids";
import { fingerprint } from "./svg";

const MAJOR_PENT = [0, 2, 4, 7, 9] as const;
const MINOR_PENT = [0, 3, 5, 7, 10] as const;
const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR = [0, 2, 3, 5, 7, 8, 10] as const;
const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10] as const;
const WHOLE = [0, 2, 4, 6, 8, 10] as const;
const SUSPENDED = [0, 2, 5, 7, 10] as const;
const FIFTHS = [0, 7] as const;

interface DimensionRow {
  readonly tempo: number;
  readonly scale: readonly number[];
  readonly root: number;
  readonly chordLoop: readonly number[];
  readonly bassPattern: readonly number[];
  readonly motifPattern: readonly number[];
  readonly rhythm: number;
  readonly bass: OscillatorKind;
  readonly motif: OscillatorKind;
}

const ROWS: readonly DimensionRow[] = [
  { tempo: 88, scale: MAJOR_PENT, root: 60, chordLoop: [0, 4, 5, 0], bassPattern: [0, 0, 4, 0], motifPattern: [0, 2, 4, 2], rhythm: 0b1010_1010_1010_1010, bass: "sine", motif: "sine" },
  { tempo: 108, scale: MINOR_PENT, root: 57, chordLoop: [0, 3, 0, 5], bassPattern: [0, 3, 0, 7], motifPattern: [0, 3, 5, 7], rhythm: 0b1001_1010_1001_0101, bass: "triangle", motif: "triangle" },
  { tempo: 92, scale: MAJOR, root: 55, chordLoop: [0, 3, 4, 0], bassPattern: [0, 0, 0, 4], motifPattern: [0, 2, 4, 5], rhythm: 0b1010_1010_1010_1000, bass: "triangle", motif: "sine" },
  { tempo: 100, scale: MAJOR, root: 62, chordLoop: [0, 0, 4, 0], bassPattern: [0, 0, 0, 0], motifPattern: [0, 1, 2, 3], rhythm: 0b1010_1010_1010_1010, bass: "square", motif: "square" },
  { tempo: 72, scale: MAJOR_PENT, root: 48, chordLoop: [0, 0, 2, 0], bassPattern: [0, 0, 0, 7], motifPattern: [0, 0, 2, 0], rhythm: 0b1000_1000_1000_1000, bass: "sawtooth", motif: "triangle" },
  { tempo: 76, scale: MINOR, root: 50, chordLoop: [0, 6, 0, 3], bassPattern: [0, 0, 7, 0], motifPattern: [0, 2, 0, 3], rhythm: 0b1000_0010_1000_0001, bass: "square", motif: "sawtooth" },
  { tempo: 118, scale: LYDIAN, root: 64, chordLoop: [0, 4, 1, 4], bassPattern: [0, 4, 7, 4], motifPattern: [0, 2, 4, 6], rhythm: 0b1010_0101_1010_0101, bass: "sine", motif: "sine" },
  { tempo: 128, scale: WHOLE, root: 60, chordLoop: [0, 2, 4, 6], bassPattern: [0, 2, 4, 6], motifPattern: [0, 4, 2, 6], rhythm: 0b1001_1001_1001_1001, bass: "sawtooth", motif: "square" },
  { tempo: 70, scale: MAJOR_PENT, root: 72, chordLoop: [0, 4, 0, 4], bassPattern: [0, 0, 4, 0], motifPattern: [4, 2, 0, 2], rhythm: 0b1000_0000_1000_0000, bass: "sine", motif: "sine" },
  { tempo: 84, scale: SUSPENDED, root: 65, chordLoop: [0, 3, 0, 4], bassPattern: [0, 5, 0, 5], motifPattern: [0, 2, 3, 2], rhythm: 0b0100_1000_0100_1000, bass: "sine", motif: "triangle" },
  { tempo: 120, scale: DORIAN, root: 60, chordLoop: [0, 4, 0, 5], bassPattern: [0, 0, 7, 0], motifPattern: [0, 2, 3, 5], rhythm: 0b1010_1010_0101_0101, bass: "square", motif: "sine" },
  { tempo: 60, scale: FIFTHS, root: 40, chordLoop: [0, 0, 0, 7], bassPattern: [0, 0, 0, 0], motifPattern: [0, 7, 0, 12], rhythm: 0b1000_0000_0000_1000, bass: "sine", motif: "sine" },
  { tempo: 66, scale: MINOR, root: 41, chordLoop: [0, 0, 3, 0], bassPattern: [0, 0, 0, 3], motifPattern: [0, 0, 2, 0], rhythm: 0b1000_0000_1000_0000, bass: "triangle", motif: "sine" },
  { tempo: 58, scale: LOCRIAN, root: 36, chordLoop: [0, 1, 0, 6], bassPattern: [0, 0, 0, 0], motifPattern: [0, 1, 3, 1], rhythm: 0b1000_0000_0010_0000, bass: "sawtooth", motif: "sawtooth" },
  { tempo: 80, scale: FIFTHS, root: 67, chordLoop: [0, 7, 0, 7], bassPattern: [0, 7, 0, 7], motifPattern: [0, 7, 12, 7], rhythm: 0b1000_1000_1000_1000, bass: "sine", motif: "sine" },
  { tempo: 96, scale: MAJOR, root: 62, chordLoop: [0, 4, 5, 0], bassPattern: [0, 4, 0, 7], motifPattern: [0, 2, 4, 7], rhythm: 0b1010_1101_1010_1101, bass: "square", motif: "sine" },
];

const STEPS = 16;

function maskBits(bits: number): boolean[] {
  return Array.from({ length: STEPS }, (_, step) => ((bits >> (STEPS - 1 - step)) & 1) === 1);
}

function voices(bass: OscillatorKind, motif: OscillatorKind, bassGain: number, motifGain: number): MusicVoice[] {
  return [
    { id: "bass", oscillator: bass, filterHz: 420, gain: bassGain },
    { id: "motif", oscillator: motif, filterHz: 1800, gain: motifGain },
  ];
}

function degreePitch(root: number, scale: readonly number[], degree: number, octave: number): number {
  const span = scale.length;
  const index = ((degree % span) + span) % span;
  const wraps = Math.floor(degree / span) + octave;
  return root + (scale[index] ?? 0) + wraps * 12;
}

function notesFor(row: DimensionRow, salt: number): NoteEvent[] {
  const mask = maskBits(row.rhythm);
  const notes: NoteEvent[] = [];
  for (let step = 0; step < STEPS; step += 1) {
    if (step % 4 === 0) {
      const chord = row.chordLoop[Math.floor(step / 4) % row.chordLoop.length] ?? 0;
      const bassDeg = row.bassPattern[Math.floor(step / 4) % row.bassPattern.length] ?? 0;
      notes.push({
        step,
        pitch: degreePitch(row.root, row.scale, bassDeg + chord, -1),
        durationSteps: 4,
        velocity: 0.55,
        voiceId: "bass",
      });
    }
    if (mask[step]) {
      const motifDeg = row.motifPattern[step % row.motifPattern.length] ?? 0;
      const jitter = (salt + step * 17) % 3 === 0 ? 1 : 0;
      notes.push({
        step,
        pitch: degreePitch(row.root, row.scale, motifDeg + jitter, 0),
        durationSteps: 1,
        velocity: 0.4,
        voiceId: "motif",
      });
    }
  }
  return notes;
}

function profileFrom(dimension: number, secondary: number | null, row: DimensionRow, salt: number, id: string): MusicProfile {
  const definition = DIMENSIONS[dimension];
  return {
    id,
    dimension,
    secondaryDimension: secondary,
    name: definition?.name ?? `dimension ${dimension}`,
    tempo: row.tempo,
    meter: 4,
    steps: STEPS,
    scale: row.scale,
    root: row.root,
    chordLoop: row.chordLoop,
    bassPattern: row.bassPattern,
    motifPattern: row.motifPattern,
    rhythmMask: maskBits(row.rhythm),
    voices: voices(row.bass, row.motif, 0.18, 0.12),
    notes: notesFor(row, salt),
  };
}

export function dimensionMusicProfile(dimension: number): MusicProfile {
  const row = ROWS[dimension];
  if (!row) {
    throw new Error(`missing music profile for dimension ${dimension}`);
  }
  return profileFrom(dimension, null, row, fingerprint(`music.${dimension}`), musicDimensionKey(dimension));
}

export function planeMusicProfile(plane: PlanePair): MusicProfile {
  const canonical = canonicalizePlane(plane.a, plane.b);
  const dominant = ROWS[canonical.b];
  const secondary = ROWS[canonical.a];
  if (!dominant || !secondary) {
    throw new Error(`missing music profile for plane (${canonical.a},${canonical.b})`);
  }
  const mixed: DimensionRow = {
    tempo: dominant.tempo,
    scale: dominant.scale,
    root: dominant.root,
    chordLoop: dominant.chordLoop,
    bassPattern: dominant.bassPattern,
    motifPattern: secondary.motifPattern,
    rhythm: secondary.rhythm,
    bass: dominant.bass,
    motif: secondary.motif,
  };
  return profileFrom(
    canonical.b,
    canonical.a,
    mixed,
    fingerprint(`music.${canonical.a}.${canonical.b}`),
    musicPlaneKey(canonical.a, canonical.b),
  );
}
