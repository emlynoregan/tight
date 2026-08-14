import type { AudioPreferences } from "../presentation/audio-types";
import type { SaveRecord } from "../core/save-record";

export const ACTIVE_SAVE_KEY = "active";
export const AUDIO_PREFS_KEY = "audio";

export interface StoredPreferences {
  readonly audio: AudioPreferences;
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

  constructor(private readonly store: Persistence) {}

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
    this.chain = write.catch(() => undefined);
    return write;
  }

  flush(): Promise<void> {
    return this.chain;
  }
}
