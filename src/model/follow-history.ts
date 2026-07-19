// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Follow History Model
//
// Stores a local record of every user the viewer has followed via this tool.
// The data persists in localStorage and drives the auto-unfollow timer logic.
// ─────────────────────────────────────────────────────────────────────────────
import { FOLLOW_HISTORY_STORAGE_KEY } from '../constants/constants';

export { FOLLOW_HISTORY_STORAGE_KEY };

/**
 * Source of the follow timestamp:
 *  - 'live'      → recorded the moment the follow action was executed by this app
 *  - 'estimated' → inferred from position in the following list (earlier entries = older)
 *  - 'manual'    → user explicitly set the follow time via the UI
 */
export type FollowDateSource = 'live' | 'estimated' | 'snapshot' | 'manual';

/**
 * A single tracked follow event.
 * userId is a numeric AniList ID (stored as number, not string).
 */
export interface FollowHistoryEntry {
  /** AniList numeric user ID. */
  readonly userId:          number;
  /** Display name at the time of follow (may drift if user renames). */
  readonly username:        string;
  /** Unix timestamp (ms) when the follow was recorded. */
  readonly followedAt:      number;
  /** How the followedAt timestamp was determined. */
  readonly followDateSource?: FollowDateSource;
  /**
   * True if the user has posted an AniList activity AFTER we followed them.
   * Detected by querying their activities and checking if createdAt > followedAt.
   * Mirrors the Instagram implementation's hasPostedSinceFollow field exactly.
   */
  readonly hasPostedSinceFollow?: boolean;
  /**
   * Unix timestamp (ms) of the last time we queried this user's activity
   * to update hasPostedSinceFollow. Avoids redundant API calls.
   */
  readonly lastActivityCheckedAt?: number;
}

export interface FollowHistory {
  readonly entries: readonly FollowHistoryEntry[];
}
