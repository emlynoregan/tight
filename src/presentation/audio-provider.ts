import type { AudioCueEquivalent, AudioPreferences, MusicHandle, MusicRequest, SynthPatch } from "./audio-types";

export interface AudioCueRequest {
  readonly semanticId: string;
  readonly family?: string;
  readonly intensity?: number;
}

export interface AudioCueHandle {
  readonly semanticId: string;
  readonly silent: boolean;
  readonly patch: SynthPatch | null;
  readonly equivalent: AudioCueEquivalent | null;
}

export class MissingAudioError extends Error {
  readonly semanticId: string;
  constructor(semanticId: string) {
    super(`missing audio presentation key: ${semanticId}`);
    this.name = "MissingAudioError";
    this.semanticId = semanticId;
  }
}

export interface AudioProvider {
  readonly id: string;
  has(semanticId: string): boolean;
  resolveCue(request: AudioCueRequest): AudioCueHandle;
  resolveMusic(request: MusicRequest): MusicHandle;
  getPreferences(): AudioPreferences;
  setPreferences(prefs: Partial<AudioPreferences>): void;
  ensureContext(): boolean;
  /** User-gesture activation. Creates a context if needed and resumes a suspended one. */
  resume(): Promise<void>;
  playCue(request: AudioCueRequest): AudioCueHandle;
  startMusic(request: MusicRequest): MusicHandle;
  stopMusic(): void;
  suspend(): void;
}

const MUTE: AudioPreferences = { enabled: false, master: 0, music: 0, sfx: 0 };

/** Mute adapter. Ticket 13 playback lives on ProceduralAudioProvider. */
export class SilentAudioProvider implements AudioProvider {
  readonly id = "silent";
  private prefs: AudioPreferences = MUTE;

  has(_semanticId: string): boolean {
    return true;
  }

  resolveCue(request: AudioCueRequest): AudioCueHandle {
    return { semanticId: request.semanticId, silent: true, patch: null, equivalent: null };
  }

  resolveMusic(request: MusicRequest): MusicHandle {
    const id = request.plane ? `music.plane.${request.plane.a}.${request.plane.b}` : `music.dimension.${request.dimension ?? 0}`;
    return { id, silent: true, profile: null };
  }

  getPreferences(): AudioPreferences {
    return this.prefs;
  }

  setPreferences(prefs: Partial<AudioPreferences>): void {
    this.prefs = {
      enabled: prefs.enabled ?? this.prefs.enabled,
      master: prefs.master ?? this.prefs.master,
      music: prefs.music ?? this.prefs.music,
      sfx: prefs.sfx ?? this.prefs.sfx,
    };
  }

  ensureContext(): boolean {
    return false;
  }

  async resume(): Promise<void> {}

  playCue(request: AudioCueRequest): AudioCueHandle {
    return this.resolveCue(request);
  }

  startMusic(request: MusicRequest): MusicHandle {
    return this.resolveMusic(request);
  }

  stopMusic(): void {}

  suspend(): void {}
}
