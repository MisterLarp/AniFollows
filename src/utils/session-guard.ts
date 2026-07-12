// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Session Guard
//
// Tracks daily API request counts and enforces cooldowns to prevent AniList
// from rate-limiting / blocking the app.
//
// All state is persisted in localStorage so it survives page reloads and
// multiple script runs throughout the same day.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SESSION_GUARD_KEY,
  MAX_SCAN_PAGES_PER_DAY,
  MAX_MUTATIONS_PER_DAY,
  MAX_RUNS_PER_DAY,
  MIN_RUN_GAP_MS,
  HARD_COOLDOWN_MS,
} from '../constants/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionGuardData {
  /** ISO date string "YYYY-MM-DD" for the current day bucket. */
  readonly day:              string;
  /** Number of following/follower list pages fetched today. */
  readonly scanPages:        number;
  /** Number of state-changing mutations (follow/unfollow/like) executed today. */
  readonly mutations:        number;
  /** Number of times the script has been "Run" (scan initiated) today. */
  readonly runCount:         number;
  /** Unix timestamp (ms) of the last run. */
  readonly lastRunAt:        number;
  /** ms of extra per-request jitter to add when usage is high. */
  readonly jitterMultiplier: number;
}

export interface SessionGuardStatus {
  readonly ok:           boolean;
  /** Human-readable warning if ok === false or if close to a limit. */
  readonly warning?:     string;
  /** Suggested extra delay in ms before the next request. */
  readonly extraDelayMs: number;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function load(): SessionGuardData {
  try {
    const raw = localStorage.getItem(SESSION_GUARD_KEY);
    if (raw) {
      const data = JSON.parse(raw) as SessionGuardData;
      // Reset counts on a new calendar day
      if (data.day !== today()) {
        return freshDay();
      }
      return data;
    }
  } catch {
    /* ignore */
  }
  return freshDay();
}

function freshDay(): SessionGuardData {
  return {
    day:              today(),
    scanPages:        0,
    mutations:        0,
    runCount:         0,
    lastRunAt:        0,
    jitterMultiplier: 1,
  };
}

function save(data: SessionGuardData): void {
  try {
    localStorage.setItem(SESSION_GUARD_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Recalculate jitter multiplier based on daily usage. */
function computeJitter(data: SessionGuardData): number {
  // Scale from 1× at 0 runs up to 4× at MAX_RUNS_PER_DAY runs
  const runRatio  = Math.min(data.runCount / MAX_RUNS_PER_DAY, 1);
  const pageRatio = Math.min(data.scanPages / MAX_SCAN_PAGES_PER_DAY, 1);
  const mutRatio  = Math.min(data.mutations / MAX_MUTATIONS_PER_DAY, 1);

  const ratio = Math.max(runRatio, pageRatio, mutRatio);
  return 1 + ratio * 3; // 1×..4×
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once when the user initiates a full scan.
 * Returns a status object; if ok===false the caller should warn + optionally abort.
 */
export function recordScriptRun(): SessionGuardStatus {
  const data = load();
  const now = Date.now();

  // Too soon after previous run?
  const gap = now - data.lastRunAt;
  if (data.lastRunAt > 0 && gap < MIN_RUN_GAP_MS) {
    const waitSec = Math.ceil((MIN_RUN_GAP_MS - gap) / 1000);
    return {
      ok: false,
      warning: `⚠️ You ran a scan ${Math.round(gap / 1000)}s ago. Please wait ${waitSec}s before scanning again to avoid AniList rate limits.`,
      extraDelayMs: MIN_RUN_GAP_MS - gap,
    };
  }

  const updated: SessionGuardData = {
    ...data,
    runCount: data.runCount + 1,
    lastRunAt: now,
  };
  
  const finalUpdated = { ...updated, jitterMultiplier: computeJitter(updated) };
  save(finalUpdated);

  if (finalUpdated.runCount > MAX_RUNS_PER_DAY) {
    return {
      ok: true, // still proceed but warn loudly
      warning: `⚠️ You've run this script ${finalUpdated.runCount} times today (safe limit: ${MAX_RUNS_PER_DAY}). AniList may limit you.`,
      extraDelayMs: 5000 * (finalUpdated.runCount - MAX_RUNS_PER_DAY),
    };
  }

  return { ok: true, extraDelayMs: 0 };
}

/**
 * Call after each following/follower page is fetched.
 * Returns how many extra ms to sleep before the next request.
 */
export function recordScanPage(): SessionGuardStatus {
  const data = load();
  
  const updated: SessionGuardData = {
    ...data,
    scanPages: data.scanPages + 1,
  };

  const finalUpdated = { ...updated, jitterMultiplier: computeJitter(updated) };
  save(finalUpdated);

  if (finalUpdated.scanPages > MAX_SCAN_PAGES_PER_DAY) {
    return {
      ok: false,
      warning: `🛑 Daily scan limit reached (${finalUpdated.scanPages} pages). Pausing ${HARD_COOLDOWN_MS / 60_000} min to protect your rate limit.`,
      extraDelayMs: HARD_COOLDOWN_MS,
    };
  }

  // Progressive slow-down as we approach the limit
  const ratio = finalUpdated.scanPages / MAX_SCAN_PAGES_PER_DAY;
  const extra = ratio > 0.7 ? Math.round(ratio * 3000 * finalUpdated.jitterMultiplier) : 0;
  
  return { ok: true, extraDelayMs: extra };
}

/**
 * Call before each mutation (follow / unfollow / like).
 * Returns how many extra ms to sleep (or a hard-stop warning).
 */
export function recordMutation(): SessionGuardStatus {
  const data = load();
  
  const updated: SessionGuardData = {
    ...data,
    mutations: data.mutations + 1,
  };

  const finalUpdated = { ...updated, jitterMultiplier: computeJitter(updated) };
  save(finalUpdated);

  if (finalUpdated.mutations > MAX_MUTATIONS_PER_DAY) {
    return {
      ok: false,
      warning: `🛑 Daily mutation limit reached (${finalUpdated.mutations}). AniList caps action density. Pausing ${HARD_COOLDOWN_MS / 60_000} min.`,
      extraDelayMs: HARD_COOLDOWN_MS,
    };
  }

  const ratio = finalUpdated.mutations / MAX_MUTATIONS_PER_DAY;
  const extra = ratio > 0.6 ? Math.round(ratio * 2000 * finalUpdated.jitterMultiplier) : 0;
  
  return { ok: true, extraDelayMs: extra };
}

/**
 * Get current day stats for display in the UI.
 */
export function getSessionStats(): SessionGuardData {
  return load();
}

/**
 * Extra random jitter (ms) based on current daily usage.
 * Add this on top of normal sleeps.
 */
export function sessionJitter(baseRangeMs: number = 1000): number {
  const data = load();
  return Math.round(Math.random() * baseRangeMs * data.jitterMultiplier);
}
