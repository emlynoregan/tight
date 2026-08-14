import { MissingAudioError, type AudioCueHandle, type AudioCueRequest, type AudioProvider } from "./audio-provider";
import type { AudioPreferences, MusicHandle, MusicRequest } from "./audio-types";

const MUTE: AudioPreferences = { enabled: false, master: 0, music: 0, sfx: 0 };

/** Empty until real audio assets are registered. */
export class AssetAudioProvider implements AudioProvider {
  readonly id = "asset";
  private readonly cues = new Map<string, AudioCueHandle>();
  private readonly tracks = new Map<string, MusicHandle>();
  private prefs: AudioPreferences = MUTE;

  has(semanticId: string): boolean {
    return this.cues.has(semanticId) || this.tracks.has(semanticId);
  }

  putCue(semanticId: string, handle: AudioCueHandle): void {
    this.cues.set(semanticId, handle);
  }

  putMusic(id: string, handle: MusicHandle): void {
    this.tracks.set(id, handle);
  }

  resolveCue(request: AudioCueRequest): AudioCueHandle {
    const handle = this.cues.get(request.semanticId);
    if (!handle) {
      throw new MissingAudioError(request.semanticId);
    }
    return handle;
  }

  resolveMusic(request: MusicRequest): MusicHandle {
    const id = request.plane ? `music.plane.${request.plane.a}.${request.plane.b}` : `music.dimension.${request.dimension ?? 0}`;
    const handle = this.tracks.get(id);
    if (!handle) {
      throw new MissingAudioError(id);
    }
    return handle;
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

  playCue(request: AudioCueRequest): AudioCueHandle {
    return this.resolveCue(request);
  }

  startMusic(request: MusicRequest): MusicHandle {
    return this.resolveMusic(request);
  }

  stopMusic(): void {}

  suspend(): void {}
}
