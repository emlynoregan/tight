import type { AudioPreferences } from "../presentation/audio-types";
import type { SaveRecord } from "../core/save-record";

export const ACTIVE_SAVE_KEY = "active";
export const AUDIO_PREFS_KEY = "audio";

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  enabled: true,
  master: 1,
  music: 0.7,
  sfx: 0.85,
};

export interface StoredPreferences {
  readonly audio: AudioPreferences;
  readonly reducedShake: boolean;
  readonly reducedFlash: boolean;
}

export interface Persistence {
  getSave(): Promise<SaveRecord | null>;
  putSave(record: SaveRecord): Promise<void>;
  getPreferences(): Promise<StoredPreferences | null>;
  putPreferences(prefs: StoredPreferences): Promise<void>;
  getCache(key: string): Promise<unknown>;
  putCache(key: string, value: unknown): Promise<void>;
  clearCache(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampUnit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function defaultPreferences(prefersReducedMotion = false): StoredPreferences {
  return {
    audio: { ...DEFAULT_AUDIO_PREFERENCES },
    reducedShake: prefersReducedMotion,
    reducedFlash: prefersReducedMotion,
  };
}

export function normalizePreferences(value: unknown, prefersReducedMotion = false): StoredPreferences {
  const fallback = defaultPreferences(prefersReducedMotion);
  if (!isRecord(value)) {
    return fallback;
  }
  const audioValue = isRecord(value.audio) ? value.audio : value;
  return {
    audio: {
      enabled: typeof audioValue.enabled === "boolean" ? audioValue.enabled : fallback.audio.enabled,
      master: clampUnit(audioValue.master, fallback.audio.master),
      music: clampUnit(audioValue.music, fallback.audio.music),
      sfx: clampUnit(audioValue.sfx, fallback.audio.sfx),
    },
    reducedShake: typeof value.reducedShake === "boolean" ? value.reducedShake : fallback.reducedShake,
    reducedFlash: typeof value.reducedFlash === "boolean" ? value.reducedFlash : fallback.reducedFlash,
  };
}

export class MemoryPersistence implements Persistence {
  save: SaveRecord | null = null;
  preferences: StoredPreferences | null = null;
  readonly cache = new Map<string, unknown>();

  async getSave(): Promise<SaveRecord | null> {
    return this.save;
  }

  async putSave(record: SaveRecord): Promise<void> {
    this.save = record;
  }

  async getPreferences(): Promise<StoredPreferences | null> {
    return this.preferences;
  }

  async putPreferences(prefs: StoredPreferences): Promise<void> {
    this.preferences = prefs;
  }

  async getCache(key: string): Promise<unknown> {
    return this.cache.get(key);
  }

  async putCache(key: string, value: unknown): Promise<void> {
    this.cache.set(key, value);
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }
}

export class PersistenceQueue {
  private chain: Promise<void> = Promise.resolve();
  private latest: SaveRecord | null = null;

  constructor(
    private readonly store: Persistence,
    private readonly onError?: (error: unknown) => void,
  ) {}

  enqueue(record: SaveRecord): Promise<void> {
    this.latest = record;
    const write = this.chain.then(async () => {
      const next = this.latest;
      if (!next) {
        return;
      }
      this.latest = null;
      await this.store.putSave(next);
    });
    this.chain = write.catch((error) => {
      this.onError?.(error);
    });
    return write;
  }

  flush(): Promise<void> {
    return this.chain;
  }
}
