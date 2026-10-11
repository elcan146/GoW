import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Synchronous localStorage-compatible shim over AsyncStorage.
 * The shared game code (store.ts) reads/writes via globalThis.localStorage;
 * this shim keeps that code identical to the web version. Writes go to an
 * in-memory cache (sync reads) and flush to AsyncStorage in the background.
 * hydrateStorage() must run before the store module is first evaluated —
 * index.js handles that ordering.
 */

const cache = new Map<string, string>();

// Keys the game actually uses (see store.ts / audio.ts).
const KEYS = ['grails-of-war-deck', 'grails-of-war-saved-decks', 'gow-muted'];

const shim = {
  getItem: (k: string): string | null => cache.get(k) ?? null,
  setItem: (k: string, v: string): void => {
    cache.set(k, String(v));
    AsyncStorage.setItem(k, String(v)).catch(() => {});
  },
  removeItem: (k: string): void => {
    cache.delete(k);
    AsyncStorage.removeItem(k).catch(() => {});
  },
  clear: (): void => {
    cache.clear();
    AsyncStorage.clear().catch(() => {});
  },
  key: (i: number): string | null => [...cache.keys()][i] ?? null,
  get length(): number {
    return cache.size;
  },
};

(globalThis as { localStorage?: unknown }).localStorage = shim;

/** Direct handle for code that can't rely on the global (typed) localStorage. */
export const kv = shim;

/** Load persisted keys into the sync cache. Call once at app start. */
export async function hydrateStorage(): Promise<void> {
  try {
    const pairs = await AsyncStorage.multiGet(KEYS);
    for (const [k, v] of pairs) {
      if (v != null) cache.set(k, v);
    }
  } catch {
    /* fresh install or storage unavailable — start empty */
  }
}
