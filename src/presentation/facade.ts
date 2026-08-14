import { SilentAudioProvider, type AudioCueHandle, type AudioCueRequest, type AudioProvider } from "./audio-provider";
import type { AudioPreferences, MusicHandle, MusicRequest } from "./audio-types";
import type { VisualProvider } from "./visual-provider";
import type { DimensionVisualProfile, ResolvedVisual, VisualRequest } from "./visual-types";

export class PresentationFacade {
  constructor(
    readonly visual: VisualProvider,
    readonly audio: AudioProvider = new SilentAudioProvider(),
  ) {}

  resolveVisual(request: VisualRequest): ResolvedVisual {
    return this.visual.resolve(request);
  }

  resolveAudio(request: AudioCueRequest): AudioCueHandle {
    return this.audio.resolveCue(request);
  }

  playCue(request: AudioCueRequest): AudioCueHandle {
    return this.audio.playCue(request);
  }

  resolveMusic(request: MusicRequest): MusicHandle {
    return this.audio.resolveMusic(request);
  }

  startMusic(request: MusicRequest): MusicHandle {
    return this.audio.startMusic(request);
  }

  stopMusic(): void {
    this.audio.stopMusic();
  }

  setAudioPreferences(prefs: Partial<AudioPreferences>): void {
    this.audio.setPreferences(prefs);
  }

  resume(): Promise<void> {
    return this.audio.resume();
  }

  dimensionProfile(dimension: number): DimensionVisualProfile {
    return this.visual.dimensionProfile(dimension);
  }
}
