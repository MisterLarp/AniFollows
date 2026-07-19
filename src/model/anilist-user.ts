// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — AniList User Model
// ─────────────────────────────────────────────────────────────────────────────

// ── Core User ─────────────────────────────────────────────────────────────────

export interface AniListAvatar {
  readonly large:  string;
  readonly medium: string;
}

/**
 * A single AniList user as returned by the Following / Followers queries.
 * This is the canonical runtime user shape used throughout the app.
 */
export interface AniListUser {
  /** Numeric AniList user ID. */
  readonly id: number;
  /** The user's AniList display name. */
  readonly name: string;
  /** Avatar image URLs. */
  readonly avatar: AniListAvatar;
  /** Full profile URL, e.g. https://anilist.co/user/SomeUser */
  readonly siteUrl: string;
  /**
   * True if the authenticated viewer is currently following this user.
   * Populated after comparing the following list against the followers list.
   */
  isFollowing: boolean;
  /**
   * True if this user currently follows the authenticated viewer back.
   * Populated after comparing the followers list.
   */
  isFollower: boolean;
}

// ── Viewer (Self) ─────────────────────────────────────────────────────────────

/**
 * The authenticated viewer's own profile information.
 * Fetched once on startup and cached in localStorage.
 */
export interface AniListViewer {
  readonly id:     number;
  readonly name:   string;
  readonly avatar: AniListAvatar;
}

// ── GraphQL Response Wrappers ─────────────────────────────────────────────────

export interface PageInfo {
  readonly currentPage:  number;
  readonly hasNextPage:  boolean;
  readonly perPage:      number;
  readonly total?:       number;  // unreliable per AniList docs — do not rely on
  readonly lastPage?:    number;  // unreliable per AniList docs — do not rely on
}

/** Wrapper for a Page query that returns a list of AniListUser records. */
export interface UserPage {
  readonly pageInfo: PageInfo;
  /** Either `following` or `followers` depending on the query. */
  readonly users:    readonly AniListUser[];
}

// ── Activity Types ────────────────────────────────────────────────────────────

/**
 * A ListActivity entry from the global feed.
 * Only the fields we actually use are listed here.
 */
export interface AniListActivity {
  readonly id:        number;
  readonly userId:    number;
  readonly likeCount: number;
  /**
   * The typename as returned by the GraphQL `__typename` field.
   * We only engage with "ListActivity" entries.
   */
  readonly __typename: 'ListActivity' | 'TextActivity' | 'MessageActivity';
}

/** Shape of the user object embedded inside a ListActivity. */
export interface ActivityUser {
  readonly id:     number;
  readonly name:   string;
  readonly avatar: AniListAvatar;
}

// ── Follow History ────────────────────────────────────────────────────────────

export type FollowDateSource = 'live' | 'estimated' | 'snapshot' | 'manual';

export interface FollowHistoryEntry {
  readonly userId:     number;
  readonly username:   string;
  /** Unix timestamp (ms) at which we recorded this follow. */
  readonly followedAt: number;
  readonly followDateSource?: FollowDateSource;
  readonly hasPostedSinceFollow?: boolean;
  readonly lastActivityCheckedAt?: number;
}

export interface FollowHistory {
  readonly entries: readonly FollowHistoryEntry[];
}

// ── Auto-Unfollow ─────────────────────────────────────────────────────────────

export enum UnfollowReason {
  /** 24 hours elapsed, user posted after being followed, but still no followback.
   * This is the "premium" 24h trigger — mirrors Instagram's POSTED_NO_FOLLOWBACK. */
  POSTED_NO_FOLLOWBACK = 'POSTED_NO_FOLLOWBACK',
  /** 24 hours elapsed and no followback (soft timeout, no activity check). */
  TIMEOUT_24H          = 'TIMEOUT_24H',
  /** 48 hours elapsed and still no followback. */
  TIMEOUT_48H          = 'TIMEOUT_48H',
}

export interface UnfollowCandidate {
  readonly user:             AniListUser;
  readonly reason:           UnfollowReason;
  readonly followEntry:      FollowHistoryEntry;
  readonly hoursSinceFollow: number;
}
