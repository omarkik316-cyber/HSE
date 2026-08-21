"use client";

import type { Observation, Profile } from "@/types";

// The dashboard, stats, and observation-creation flow all gate on data
// that only exists after a successful Supabase fetch. Offline, that fetch
// never resolves — and without a fallback, whatever effect was waiting on
// it (profile load blocking "tap the map to report", observations feeding
// the stats charts) just hangs forever with no way out. Caching the last
// successful result here means those screens have *something* correct to
// show/act on the instant a fetch fails, instead of stalling.
//
// This uses IndexedDB, not localStorage. localStorage's getItem/setItem
// calls are synchronous and block the main thread for as long as the JSON
// stringify/parse + disk write takes — on a project with a large
// observation history that's a real, felt stutter on a screen that's
// already busy rendering a map. IndexedDB does the same job off the main
// thread, and can store the objects directly with no manual
// JSON.stringify/parse step either.

const DB_NAME = "hse-read-cache";
const STORE = "kv";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const PROFILE_KEY = "profile";
const OBSERVATIONS_KEY = "observations";

export async function cacheProfile(profile: Profile | null): Promise<void> {
  if (!profile || typeof window === "undefined") return;
  try {
    await withStore("readwrite", (store) => store.put(profile, PROFILE_KEY));
  } catch {
    // Best-effort — a caching failure shouldn't affect the live fetch.
  }
}

/** Returns the cached profile only if it matches the signed-in user. */
export async function getCachedProfile(userId: string): Promise<Profile | null> {
  if (typeof window === "undefined") return null;
  try {
    const cached = await withStore<Profile | undefined>("readonly", (store) => store.get(PROFILE_KEY));
    return cached?.id === userId ? cached : null;
  } catch {
    return null;
  }
}

export async function cacheObservations(observations: Observation[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await withStore("readwrite", (store) => store.put(observations, OBSERVATIONS_KEY));
  } catch {
    // Quota exceeded on a very large project history, most likely — offline
    // browsing just falls back to whatever was cached last time, which is
    // still far better than throwing here and breaking the live fetch path.
  }
}

export async function getCachedObservations(): Promise<Observation[]> {
  if (typeof window === "undefined") return [];
  try {
    const cached = await withStore<Observation[] | undefined>("readonly", (store) => store.get(OBSERVATIONS_KEY));
    return cached ?? [];
  } catch {
    return [];
  }
}
