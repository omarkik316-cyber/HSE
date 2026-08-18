"use client";

import type { Observation, Profile } from "@/types";

// The dashboard, stats, and observation-creation flow all gate on data
// that only exists after a successful Supabase fetch. Offline, that fetch
// never resolves — and without a fallback, whatever effect was waiting on
// it (profile load blocking "tap the map to report", observations feeding
// the stats charts) just hangs forever with no way out. Caching the last
// successful result here means those screens have *something* correct to
// show/act on the instant a fetch fails, instead of stalling.

const PROFILE_KEY = "hse-cache-profile";
const OBSERVATIONS_KEY = "hse-cache-observations";

export function cacheProfile(profile: Profile | null): void {
  if (!profile || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Best-effort — a caching failure shouldn't affect the live fetch.
  }
}

/** Returns the cached profile only if it matches the signed-in user. */
export function getCachedProfile(userId: string): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Profile;
    return parsed?.id === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function cacheObservations(observations: Observation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(observations));
  } catch {
    // Quota exceeded on a very large project history, most likely — offline
    // browsing just falls back to whatever was cached last time, which is
    // still far better than throwing here and breaking the live fetch path.
  }
}

export function getCachedObservations(): Observation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OBSERVATIONS_KEY);
    return raw ? (JSON.parse(raw) as Observation[]) : [];
  } catch {
    return [];
  }
}
