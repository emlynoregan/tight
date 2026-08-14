import { MissingAudioError, type AudioCueHandle, type AudioCueRequest, type AudioProvider } from "../audio-provider";
import type { AudioPreferences, MusicHandle, MusicRequest } from "../audio-types";
import { equivalentFor, requiredAudioKeys } from "../semantic-audio-ids";
import { AudioEngine } from "./audio-engine";
import { dimensionMusicProfile, planeMusicProfile } from "./music";
import { assertSfxCoverage, sfxPatch } from "./sfx";

export class ProceduralAudioProvider implements AudioProvider {
  readonly id = "procedural";
  private readonly keys = new Set(requiredAudioKeys());
  private readonly engine = new AudioEngine();

  constructor() {
    assertSfxCoverage();
  }

  has(semanticId: string): boolean {
    return this.keys.has(semanticId);
  }

  resolveCue(request: AudioCueRequest): AudioCueHandle {
    if (!request.semanticId.startsWith("sfx.") || !this.has(request.semanticId)) {
      throw new MissingAudioError(request.semanticId);
    }
    const patch = sfxPatch(request.semanticId);
    if (!patch) {
      throw new MissingAudioError(request.semanticId);
    }
    return {
      semanticId: request.semanticId,
      silent: !this.engine.prefs.enabled,
      patch,
      equivalent: equivalentFor(request.semanticId),
    };
  }

  resolveMusic(request: MusicRequest): MusicHandle {
    try {
      const profile = request.plane
        ? planeMusicProfile(request.plane)
        : dimensionMusicProfile(request.dimension ?? 0);
      if (!this.has(profile.id)) {
        throw new MissingAudioError(profile.id);
      }
      return { id: profile.id, silent: !this.engine.prefs.enabled, profile };
    } catch (error) {
      if (error instanceof MissingAudioError) {
        throw error;
      }
      throw new MissingAudioError(request.plane ? `music.plane.${request.plane.a}.${request.plane.b}` : `music.dimension.${request.dimension ?? -1}`);
    }
  }

  getPreferences(): AudioPreferences {
    return this.engine.prefs;
  }

  setPreferences(prefs: Partial<AudioPreferences>): void {
    this.engine.prefs = {
      enabled: prefs.enabled ?? this.engine.prefs.enabled,
      master: prefs.master ?? this.engine.prefs.master,
      music: prefs.music ?? this.engine.prefs.music,
      sfx: prefs.sfx ?? this.engine.prefs.sfx,
    };
    this.engine.applyGains();
    if (!this.engine.prefs.enabled) {
      this.engine.stopMusic();
    }
  }

  ensureContext(): boolean {
    return this.engine.ensureContext();
  }

  resume(): Promise<void> {
    return this.engine.resume();
  }

  playCue(request: AudioCueRequest): AudioCueHandle {
    const handle = this.resolveCue(request);
    if (!handle.silent && handle.patch) {
      this.engine.playPatch(handle.patch, request.intensity ?? 1);
    }
    return handle;
  }

  startMusic(request: MusicRequest): MusicHandle {
    const handle = this.resolveMusic(request);
    if (!handle.silent && handle.profile) {
      this.engine.startMusic(handle.profile);
    }
    return handle;
  }

  stopMusic(): void {
    this.engine.stopMusic();
  }

  suspend(): void {
    this.engine.suspend();
  }
}
