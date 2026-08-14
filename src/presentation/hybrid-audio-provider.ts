import type { AudioCueHandle, AudioCueRequest, AudioProvider } from "./audio-provider";
import type { AudioPreferences, MusicHandle, MusicRequest } from "./audio-types";

export class HybridAudioProvider implements AudioProvider {
  readonly id = "hybrid";

  constructor(
    private readonly primary: AudioProvider,
    private readonly fallback: AudioProvider,
  ) {}

  has(semanticId: string): boolean {
    return this.primary.has(semanticId) || this.fallback.has(semanticId);
  }

  resolveCue(request: AudioCueRequest): AudioCueHandle {
    if (this.primary.has(request.semanticId)) {
      return this.primary.resolveCue(request);
    }
    return this.fallback.resolveCue(request);
  }

  resolveMusic(request: MusicRequest): MusicHandle {
    const id = request.plane ? `music.plane.${request.plane.a}.${request.plane.b}` : `music.dimension.${request.dimension ?? 0}`;
    if (this.primary.has(id)) {
      return this.primary.resolveMusic(request);
    }
    return this.fallback.resolveMusic(request);
  }

  getPreferences(): AudioPreferences {
    return this.fallback.getPreferences();
  }

  setPreferences(prefs: Partial<AudioPreferences>): void {
    this.primary.setPreferences(prefs);
    this.fallback.setPreferences(prefs);
  }

  ensureContext(): boolean {
    return this.primary.ensureContext() || this.fallback.ensureContext();
  }

  playCue(request: AudioCueRequest): AudioCueHandle {
    if (this.primary.has(request.semanticId)) {
      return this.primary.playCue(request);
    }
    return this.fallback.playCue(request);
  }

  startMusic(request: MusicRequest): MusicHandle {
    const id = request.plane ? `music.plane.${request.plane.a}.${request.plane.b}` : `music.dimension.${request.dimension ?? 0}`;
    if (this.primary.has(id)) {
      return this.primary.startMusic(request);
    }
    return this.fallback.startMusic(request);
  }

  stopMusic(): void {
    this.primary.stopMusic();
    this.fallback.stopMusic();
  }

  suspend(): void {
    this.primary.suspend();
    this.fallback.suspend();
  }
}
