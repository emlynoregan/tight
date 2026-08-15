import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SaveRecord } from "../core/save-record";
import { ACTIVE_SAVE_KEY, AUDIO_PREFS_KEY, MemoryPersistence, type Persistence, type StoredPreferences } from "./memory";

interface TightDb extends DBSchema {
  saves: { key: string; value: SaveRecord };
  preferences: { key: string; value: StoredPreferences };
  cache: { key: string; value: unknown };
}

const DB_NAME = "tight";
const DB_VERSION = 1;

export class IdbPersistence implements Persistence {
  private constructor(private readonly db: IDBPDatabase<TightDb>) {}

  static async open(): Promise<IdbPersistence> {
    const db = await openDB<TightDb>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("saves")) {
          database.createObjectStore("saves");
        }
        if (!database.objectStoreNames.contains("preferences")) {
          database.createObjectStore("preferences");
        }
        if (!database.objectStoreNames.contains("cache")) {
          database.createObjectStore("cache");
        }
      },
    });
    return new IdbPersistence(db);
  }

  async getSave(): Promise<SaveRecord | null> {
    return (await this.db.get("saves", ACTIVE_SAVE_KEY)) ?? null;
  }

  async putSave(record: SaveRecord): Promise<void> {
    await this.db.put("saves", record, ACTIVE_SAVE_KEY);
  }

  async getPreferences(): Promise<StoredPreferences | null> {
    return (await this.db.get("preferences", AUDIO_PREFS_KEY)) ?? null;
  }

  async putPreferences(prefs: StoredPreferences): Promise<void> {
    await this.db.put("preferences", prefs, AUDIO_PREFS_KEY);
  }

  async getCache(key: string): Promise<unknown> {
    return this.db.get("cache", key);
  }

  async putCache(key: string, value: unknown): Promise<void> {
    await this.db.put("cache", value, key);
  }

  async clearCache(): Promise<void> {
    await this.db.clear("cache");
  }
}

export interface PersistenceOpenResult {
  readonly persistence: Persistence;
  readonly warning: string | null;
}

export async function createPersistence(): Promise<PersistenceOpenResult> {
  if (typeof indexedDB === "undefined") {
    return {
      persistence: new MemoryPersistence(),
      warning: "This browser has no IndexedDB. Progress will not survive a reload.",
    };
  }
  try {
    return { persistence: await IdbPersistence.open(), warning: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown storage error";
    return {
      persistence: new MemoryPersistence(),
      warning: `IndexedDB could not be opened (${detail}). Progress will not survive a reload.`,
    };
  }
}
