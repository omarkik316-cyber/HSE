// ---------------------------------------------------------------------------
// Forces a fresh sign-in every 24 hours, independent of Supabase's own
// token refresh (which — left alone — keeps a session alive indefinitely as
// long as the app is opened at least once before the refresh token itself
// expires). This is a *local* clock: it's checked entirely from
// localStorage, so it keeps working with zero network access, which matters
// because the app is used offline on site.
//
// Note: this expiry is intentionally client-side only. It does not revoke
// the underlying Supabase session/JWT server-side — a device that is never
// reopened (so this check never runs) keeps a technically-valid token until
// Supabase's own refresh-token expiry. If you need a hard server-enforced
// 24h cutoff, that has to be set as the JWT expiry in the Supabase project's
// Auth settings instead — this only forces the *app* to ask for a fresh
// login every 24h whenever it's used.
// ---------------------------------------------------------------------------

const LOGIN_AT_KEY = "hse-login-at";
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Call right after a successful sign-in or sign-up. */
export function markLoginNow(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
  } catch {
    // Best-effort — if storage is unavailable, the guard below just won't
    // have a mark to check against and will grandfather the session in.
  }
}

/** Call on sign-out so a later sign-in starts a clean 24h window. */
export function clearLoginMark(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOGIN_AT_KEY);
  } catch {
    // no-op
  }
}

/**
 * True once 24h have passed since the recorded login. A session with no
 * recorded login (e.g. one that existed before this feature shipped) is
 * treated as fresh *once* — the caller should stamp it via markLoginNow so
 * every session has a real timestamp going forward, instead of forcing an
 * immediate surprise logout on upgrade.
 */
export function isLoginStale(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(LOGIN_AT_KEY);
    if (!raw) return false;
    const loginAt = Number(raw);
    if (!Number.isFinite(loginAt)) return false;
    return Date.now() - loginAt >= SESSION_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export function hasLoginMark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOGIN_AT_KEY) !== null;
  } catch {
    return false;
  }
}
