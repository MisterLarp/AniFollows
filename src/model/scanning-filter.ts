// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Scanning Filter Model
//
// Controls which users are visible in the results list.
// Ratio-based filtering removed — AniList has no follower/following count
// exposed on the following/followers list endpoints.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanningFilter {
  /** Show users who do NOT follow the viewer back. */
  readonly showNonFollowers:     boolean;
  /** Show users who DO follow the viewer back. */
  readonly showFollowers:        boolean;
  /** Only show users flagged by the auto-unfollow timer rules. */
  readonly showAutoUnfollowOnly: boolean;
}
