// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Application State Machine
//
// The app has five distinct top-level states:
//
//  initial          → Nothing loaded yet (or user reset the app).
//  scanning         → Fetching following + followers lists, building results.
//  unfollowing      → Executing the unfollow batch queue.
//  engaging         → Running a global feed engagement session.
//  network_following → Following users from a target user's network.
//
// State transitions are managed exclusively in main.tsx via setState().
// ─────────────────────────────────────────────────────────────────────────────

import { AniListUser, UnfollowCandidate } from './anilist-user';
import { ScanningTab }    from './scanning-tab';
import { ScanningFilter } from './scanning-filter';
import { UnfollowFilter } from './unfollow-filter';
import { UnfollowLogEntry } from './unfollow-log-entry';
import { NetworkFollowMode } from '../utils/anilist-api';

// ── Initial ───────────────────────────────────────────────────────────────────

type InitialState = {
  readonly status: 'initial';
};

// ── Scanning ──────────────────────────────────────────────────────────────────

type ScanningState = {
  readonly status: 'scanning';

  /** Human-readable description of the current sub-phase (e.g. "Fetching followers…"). */
  readonly phase: string;

  /** 0–100 overall progress percentage. */
  readonly percentage: number;

  /** All users fetched so far (following + cross-referenced with followers). */
  readonly results: readonly AniListUser[];

  /** Current results page (1-based). */
  readonly page: number;

  /** Text the user typed into the search bar. */
  readonly searchTerm: string;

  /** Which tab is active: non-whitelisted | whitelisted. */
  readonly currentTab: ScanningTab;

  /** Users the viewer has explicitly protected from auto-unfollow. */
  readonly whitelistedResults: readonly AniListUser[];

  /** Users the viewer has checked in the UI for manual unfollow. */
  readonly selectedResults: readonly AniListUser[];

  /** Active display filter flags. */
  readonly filter: ScanningFilter;

  /**
   * Users flagged by the auto-unfollow logic (24h / 48h rules).
   * Recalculated whenever results or follow-history changes.
   */
  readonly unfollowCandidates: readonly UnfollowCandidate[];

  /**
   * Incremented each time follow-history changes so React effects
   * that depend on it re-run without needing deep equality checks.
   */
  readonly followHistoryVersion: number;
};

// ── Unfollowing ───────────────────────────────────────────────────────────────

type UnfollowingState = {
  readonly status: 'unfollowing';

  /** Text the user typed into the search bar (carried over from scanning). */
  readonly searchTerm: string;

  /** 0–100 progress percentage of the unfollow batch. */
  readonly percentage: number;

  /** Ordered list of users to unfollow (as selected during scanning). */
  readonly selectedResults: readonly AniListUser[];

  /** Growing log of results as each unfollow completes. */
  readonly unfollowLog: readonly UnfollowLogEntry[];

  /** Filter applied to the unfollow log display. */
  readonly filter: UnfollowFilter;
};

// ── Engaging (Global Feed) ────────────────────────────────────────────────────

type EngagingState = {
  readonly status: 'engaging';

  /** Human-readable current action label shown in the UI. */
  readonly phase:    string;
  readonly liked:    number;
  readonly followed: number;
  readonly skipped:  number;
};

// ── Network Following ─────────────────────────────────────────────────────────

type NetworkFollowingState = {
  readonly status: 'network_following';

  /** The username the viewer entered to target. */
  readonly targetUsername: string;

  /** Whether we're following the target's followers or their following. */
  readonly mode: NetworkFollowMode;

  /** Human-readable current action label. */
  readonly phase:    string;
  readonly followed: number;
  readonly skipped:  number;
  readonly total:    number;
};

// ── Targeted Engagement ────────────────────────────────────────────────────────

type TargetedEngagementState = {
  readonly status: 'targeted_engagement';
  
  /** Current UI phase or description. */
  readonly phase: string;

  /**
   * Monotonically-increasing key incremented each time the user presses
   * "Start Engaging". The effect in main.tsx depends on this (not phase)
   * so it only fires once per session, preventing repeated fetchAllFollowers calls.
   */
  readonly sessionKey: number;
  
  readonly targetGroup: 'followers' | 'following' | 'mutuals' | 'non_mutuals' | 'reciprocal';
  
  /** Configuration for the session. */
  readonly config: {
    maxUsers: number;
    activitiesPerUser: number;
    includeMessages: boolean;
    // Specific to reciprocal
    reciprocalHours?: number;
    reciprocalMinLikes?: number;
  };

  /** Real-time progress. */
  readonly progress: {
    processedUsers: number;
    totalUsers: number;
    likedActivities: number;
    skippedActivities: number;
  };
};

// ── Union Export ──────────────────────────────────────────────────────────────

export type State =
  | InitialState
  | ScanningState
  | UnfollowingState
  | EngagingState
  | NetworkFollowingState
  | TargetedEngagementState;

// Re-export individual state types for components that need them
export type {
  InitialState,
  ScanningState,
  UnfollowingState,
  EngagingState,
  NetworkFollowingState,
  TargetedEngagementState,
};
