export interface AudioCueRequest {
  readonly semanticId: string;
  readonly family?: string;
  readonly intensity?: number;
}

export interface AudioCueHandle {
  readonly semanticId: string;
  readonly silent: boolean;
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
}

/** Ticket 13 replaces this with ProceduralAudioProvider. */
export class SilentAudioProvider implements AudioProvider {
  readonly id = "silent";
  has(_semanticId: string): boolean {
    return true;
  }
  resolveCue(request: AudioCueRequest): AudioCueHandle {
    return { semanticId: request.semanticId, silent: true };
  }
}
