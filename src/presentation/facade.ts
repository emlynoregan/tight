import { SilentAudioProvider, type AudioCueHandle, type AudioCueRequest, type AudioProvider } from "./audio-provider";
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

  dimensionProfile(dimension: number): DimensionVisualProfile {
    return this.visual.dimensionProfile(dimension);
  }
}
