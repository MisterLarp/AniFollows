// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Authentication Utility
//
// Manages the AniList Bearer token and the cached viewer profile in
// localStorage. Provides helpers to build the OAuth URL and read/write
// the stored credentials so no other module needs to know the storage keys.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ANILIST_AUTH_URL,
  TOKEN_STORAGE_KEY,
  VIEWER_STORAGE_KEY,
} from '../constants/constants';

import { AniListViewer } from '../model/anilist-user';

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — Token Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve the stored Bearer token from localStorage.
 * Returns null if no token has been saved yet.
 */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persist a Bearer token to localStorage.
 * Trims whitespace so copy-paste accidents don't break auth.
 *
 * @param token  The raw token string from AniList's PIN page.
 */
export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
  } catch (err) {
    console.error('[Auth] Failed to save token:', err);
  }
}

/**
 * Remove the stored token and cached viewer profile from localStorage.
 * Call this when the user explicitly logs out.
 */
export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(VIEWER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — Viewer Profile Cache
//
// The viewer profile (id, name, avatar) is fetched once per session from the
// AniList API and then cached in localStorage. This avoids burning an API
// request on every subsequent script run on the same device.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve the cached viewer profile from localStorage.
 * Returns null if not yet cached or if the stored JSON is malformed.
 */
export function getStoredViewer(): AniListViewer | null {
  try {
    const raw = localStorage.getItem(VIEWER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // Minimal validation — id and name must exist
    if (
      typeof parsed === 'object' && parsed !== null &&
      'id'   in parsed && typeof (parsed as AniListViewer).id   === 'number' &&
      'name' in parsed && typeof (parsed as AniListViewer).name === 'string'
    ) {
      return parsed as AniListViewer;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist the viewer profile to localStorage.
 *
 * @param viewer  Viewer object returned by fetchViewer().
 */
export function saveViewer(viewer: AniListViewer): void {
  try {
    localStorage.setItem(VIEWER_STORAGE_KEY, JSON.stringify(viewer));
  } catch (err) {
    console.error('[Auth] Failed to cache viewer:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — OAuth Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the AniList OAuth Implicit Grant URL.
 * Opening this URL redirects the user to AniList's authorization page.
 * After granting access they are redirected to the PIN page where the
 * Bearer token is displayed — they copy it and paste it into the AuthScreen.
 */
export function getAuthUrl(): string {
  return ANILIST_AUTH_URL;
}

/**
 * Validate that a string looks like a plausible Bearer token before saving.
 * AniList tokens are long alphanumeric JWT strings.
 * Returns true if the token passes basic sanity checks.
 *
 * @param token  Raw string pasted by the user.
 */
export function isValidTokenFormat(token: string): boolean {
  const trimmed = token.trim();
  // Must be at least 20 chars, no spaces inside, basic alphanumeric + special JWT chars
  return (
    trimmed.length >= 20 &&
    !/\s/.test(trimmed)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4 — Convenience: Load or Fetch Viewer
//
// Call this at startup. Returns the cached viewer if available, otherwise
// fetches it from AniList (requires the token) and caches it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the cached viewer, or fetch it from AniList and cache it.
 * The caller is responsible for passing a valid token.
 *
 * @param token      Valid Bearer token.
 * @param forceRefresh  If true, bypass the cache and always fetch fresh.
 */
export async function loadOrFetchViewer(
  token:         string,
  forceRefresh:  boolean = false,
): Promise<AniListViewer> {
  if (!forceRefresh) {
    const cached = getStoredViewer();
    if (cached) return cached;
  }

  // Import here (not at top level) to avoid a circular dependency:
  // anilist-auth → anilist-api → (no auth dependency)
  const { fetchViewer } = await import('./anilist-api');
  const viewer = await fetchViewer(token);
  saveViewer(viewer);
  return viewer;
}
