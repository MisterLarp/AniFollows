// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Constants
// ─────────────────────────────────────────────────────────────────────────────

// ── App Identity ─────────────────────────────────────────────────────────────
export const APP_NAME = 'AniFollows';
export const APP_VERSION = '1.0.0';

// ── AniList Environment ───────────────────────────────────────────────────────
export const ANILIST_HOSTNAME      = 'anilist.co';
export const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

// ── OAuth / Auth ──────────────────────────────────────────────────────────────
/** Public Client ID registered at anilist.co/settings/developer */
export const ANILIST_CLIENT_ID = '45697';
/** PIN-based implicit grant — user copies the token from AniList's PIN page */
export const ANILIST_AUTH_URL =
  `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token&redirect_uri=https://anilist.co/api/v2/oauth/pin`;

// ── localStorage Keys ─────────────────────────────────────────────────────────
export const STORAGE_PREFIX = 'alf_'; // "anilist follow" — all keys namespaced

export const TOKEN_STORAGE_KEY            = `${STORAGE_PREFIX}token`;
export const VIEWER_STORAGE_KEY           = `${STORAGE_PREFIX}viewer`;
export const WHITELISTED_RESULTS_STORAGE_KEY = `${STORAGE_PREFIX}whitelist`;
export const FOLLOW_HISTORY_STORAGE_KEY   = `${STORAGE_PREFIX}follow_history`;
export const TIMINGS_STORAGE_KEY          = `${STORAGE_PREFIX}timings`;
export const SESSION_GUARD_KEY            = `${STORAGE_PREFIX}session_guard`;

// ── Rate Limiting ─────────────────────────────────────────────────────────────
/**
 * AniList is currently degraded to 30 req/min.
 * We target ≤25 req/min for safety headroom.
 * These delays are the *minimum* floor — the session guard adds jitter on top.
 */

/** ms to wait between individual GraphQL scan requests (following/followers pages). */
export const DEFAULT_TIME_BETWEEN_SCAN_PAGES = 2_500;

/**
 * ms to wait after every 6 scan pages.
 * 6 pages @ ~2.5s each ≈ 15s of work. Then we pause ~10s before resuming.
 */
export const DEFAULT_TIME_AFTER_SCAN_BURST = 10_000;

/** ms to wait between individual follow/unfollow actions. */
export const DEFAULT_TIME_BETWEEN_ACTIONS = 2_000;

/**
 * ms to wait after every 5 follow or unfollow actions (the "5-per-5-min" rule).
 * 5 minutes = 300 000 ms.
 */
export const DEFAULT_TIME_AFTER_FIVE_ACTIONS = 300_000; // 5 minutes

// ── Pagination ────────────────────────────────────────────────────────────────
/** AniList caps Page.perPage at 50. */
export const ANILIST_PAGE_SIZE = 50;

/** Users shown per page in the results UI. */
export const USERS_PER_PAGE = 50;

// ── Global Feed Engagement ─────────────────────────────────────────────────────
/** Minimum likes an activity must have before we engage with it. */
export const GLOBAL_FEED_MIN_LIKES = 5;

/** Hard cap on likes sent per engagement session. */
export const GLOBAL_FEED_MAX_LIKES_PER_SESSION = 20;

// ── Auto-Unfollow Thresholds ──────────────────────────────────────────────────
/** If no followback after this many hours → auto-unfollow candidate (24h). */
export const AUTO_UNFOLLOW_HOURS_SOFT = 24;

/** If no followback after this many hours → force candidate regardless (48h). */
export const AUTO_UNFOLLOW_HOURS_HARD = 48;

/** Max hours we track someone in follow history before dropping them. */
export const AUTO_UNFOLLOW_TRACKING_HOURS = 96;

// ── Session Guard Limits ──────────────────────────────────────────────────────
/** Maximum GraphQL mutation calls (follow/unfollow/like) per calendar day. */
export const MAX_MUTATIONS_PER_DAY = 80;

/** Maximum following/follower list pages fetched per calendar day. */
export const MAX_SCAN_PAGES_PER_DAY = 150;

/** Maximum times the full "Run Scan" flow can be initiated per day. */
export const MAX_RUNS_PER_DAY = 8;

/** Minimum time (ms) that must pass between consecutive scan runs. */
export const MIN_RUN_GAP_MS = 8 * 60 * 1_000; // 8 minutes

/** Hard cooldown duration (ms) applied when a daily limit is exceeded. */
export const HARD_COOLDOWN_MS = 15 * 60 * 1_000; // 15 minutes

// ── DOM ───────────────────────────────────────────────────────────────────────
/** ID of the root container injected into document.body. */
export const ROOT_ELEMENT_ID = 'ani-follows-root';
