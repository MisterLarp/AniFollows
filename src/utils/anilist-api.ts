// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — AniList GraphQL API Client
//
// Responsibilities:
//  1. Central `gql()` fetch wrapper with authentication + rate-limit handling.
//  2. Live header inspection (X-RateLimit-Remaining, Retry-After).
//  3. All query + mutation definitions used by the app.
//  4. Paginated list fetchers with built-in safety delays.
//  5. A strict 5-action/5-minute batch enforcer used for follow & unfollow ops.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ANILIST_PAGE_SIZE,
  DEFAULT_TIME_BETWEEN_ACTIONS,
  DEFAULT_TIME_AFTER_FIVE_ACTIONS,
  DEFAULT_TIME_BETWEEN_SCAN_PAGES,
  DEFAULT_TIME_AFTER_SCAN_BURST,
  GLOBAL_FEED_MIN_LIKES,
  GLOBAL_FEED_MAX_LIKES_PER_SESSION,
} from '../constants/constants';

import {
  AniListUser,
  AniListViewer,

  AniListAvatar,
  PageInfo,
} from '../model/anilist-user';
import { trackFollowNow } from './follow-date-sync';

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — Primitive Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Promise-based sleep. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Random integer jitter between 0..maxMs. */
function jitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — Rate-Limit State
//
// Shared singleton so every call site sees the same window. This allows the
// batch enforcer and the scan-page fetcher to both back off when AniList
// signals it's approaching the limit.
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitState {
  /** Most recent X-RateLimit-Remaining value observed from a response header. */
  remaining: number;
  /** Unix timestamp (ms) after which we are allowed to make requests again. */
  resetAt: number;
  /** True while we are inside a 429-triggered pause. */
  backingOff: boolean;
}

const rateLimitState: RateLimitState = {
  remaining: 30,
  resetAt:   0,
  backingOff: false,
};

/**
 * Inspect a Response's headers and update the shared rate-limit state.
 * Returns the number of milliseconds the caller should wait before the next
 * request, or 0 if no wait is needed.
 */
function updateRateLimitFromHeaders(res: Response): number {
  const remaining = res.headers.get('X-RateLimit-Remaining');
  const reset     = res.headers.get('X-RateLimit-Reset');
  const retryAfter = res.headers.get('Retry-After');

  if (remaining !== null) {
    rateLimitState.remaining = parseInt(remaining, 10);
  }
  if (reset !== null) {
    rateLimitState.resetAt = parseInt(reset, 10) * 1_000; // header is seconds
  }

  // Calculate wait based on resetAt, but clamped to a sensible range (0-60s)
  // to avoid issues where the client clock is out of sync with the server clock.
  const resetWaitSec = Math.max(0, Math.ceil((rateLimitState.resetAt - Date.now()) / 1_000));
  const safeResetWaitSec = resetWaitSec > 120 ? 60 : resetWaitSec; // AniList limit window is 1 minute

  if (res.status === 429) {
    // Respect Retry-After header if present, otherwise fall back to reset time (minimum 60s as a fallback)
    const waitSec = retryAfter !== null
      ? parseInt(retryAfter, 10)
      : (safeResetWaitSec > 0 ? safeResetWaitSec : 60);

    const waitMs = (waitSec + 10) * 1_000; // +10 s buffer
    rateLimitState.backingOff = true;
    console.warn(`[AniAPI] 429 received — backing off for ${waitSec + 10}s`);
    return waitMs;
  }

  rateLimitState.backingOff = false;

  // Proactive slow-down: if fewer than 5 requests remain in the current window,
  // wait until the window resets before allowing more calls.
  // Ignore proactive slow-down if client clock is way off (safeResetWaitSec === 0 but remaining < 5)
  // In that case we just let it hit 429 and do the proper 429 backoff.
  if (rateLimitState.remaining < 5 && safeResetWaitSec > 0) {
    const waitMs = (safeResetWaitSec + 2) * 1_000; // +2 s buffer
    console.warn(`[AniAPI] Remaining=${rateLimitState.remaining} — pausing ${Math.round(waitMs / 1000)}s for reset`);
    return waitMs;
  }

  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — Core GraphQL Executor
// ─────────────────────────────────────────────────────────────────────────────

/** Typed GraphQL error from AniList. */
export interface GraphQLError {
  readonly message: string;
  readonly status?: number;
  readonly locations?: ReadonlyArray<{ line: number; column: number }>;
}

/** Generic GraphQL response wrapper. */
export interface GraphQLResponse<T> {
  readonly data:   T | null;
  readonly errors?: readonly GraphQLError[];
}

/** Thrown when a fatal API error (non-429) occurs. */
export class AniListAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: readonly GraphQLError[],
  ) {
    super(message);
    this.name = 'AniListAPIError';
  }
}

/**
 * Execute a single GraphQL query or mutation against the AniList API.
 *
 * - Attaches the Bearer token when provided.
 * - Reads rate-limit headers on every response.
 * - On 429: sleeps the prescribed backoff then **retries once**.
 * - On other non-2xx: throws AniListAPIError.
 *
 * @param query      GraphQL query/mutation string.
 * @param variables  Variable map (key → value).
 * @param token      Bearer access token. Required for mutations.
 */
export async function gql<T>(
  query:      string,
  variables:  Record<string, unknown> = {},
  token?:     string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const body = JSON.stringify({ query, variables });

  const execute = async (attempt = 1): Promise<T> => {
    let res: Response;
    try {
      res = await fetch('https://graphql.anilist.co', {
        method:  'POST',
        headers,
        body,
      });
    } catch (networkErr) {
      // If we encounter a network error (like CORS failure due to a 429 preflight block),
      // we should back off and retry before completely giving up.
      if (attempt <= 2) {
        console.warn(`[AniAPI] Network error (possibly CORS blocked 429). Retrying after 60s...`);
        await sleep(60_000);
        return execute(attempt + 1);
      }
      
      throw new AniListAPIError(
        `Network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
        0,
      );
    }

    const waitMs = updateRateLimitFromHeaders(res);

    if (res.status === 429) {
      if (attempt <= 3) {
        await sleep(waitMs);
        return execute(attempt + 1);
      } else {
        throw new AniListAPIError(`Rate limit exceeded and retries exhausted.`, 429);
      }
    }

    // Always try to read JSON — AniList returns error details in body even on 4xx
    let json: GraphQLResponse<T> | null = null;
    try {
      json = (await res.json()) as GraphQLResponse<T>;
    } catch {
      // Body wasn't JSON (rare — just throw the HTTP error)
      throw new AniListAPIError(
        `AniList API responded with HTTP ${res.status}`,
        res.status,
      );
    }

    // Surface GraphQL-level errors (these come even with HTTP 200 sometimes)
    if (json.errors && json.errors.length > 0) {
      const first = json.errors[0];
      const status = first.status ?? res.status;
      const msg = status === 404
        ? `Not found: ${first.message}`
        : status === 401
        ? 'Invalid or expired token — please re-authenticate'
        : first.message;
      throw new AniListAPIError(msg, status, json.errors);
    }

    if (!res.ok) {
      throw new AniListAPIError(
        `AniList API responded with HTTP ${res.status}`,
        res.status,
      );
    }

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    return json.data as T;
  };

  return execute();
}

// ─────────────────────────────────────────────────────────────────────────────

// § 4 — Viewer (Self) Query
// ─────────────────────────────────────────────────────────────────────────────

const VIEWER_QUERY = `
  query {
    Viewer {
      id
      name
      avatar {
        large
        medium
      }
    }
  }
`;

interface ViewerQueryResult {
  Viewer: AniListViewer;
}

/**
 * Fetch the authenticated user's own profile.
 * Call this once on startup to get the viewer's numeric ID.
 *
 * @param token Valid Bearer access token.
 */
export async function fetchViewer(token: string): Promise<AniListViewer> {
  const data = await gql<ViewerQueryResult>(VIEWER_QUERY, {}, token);
  return data.Viewer;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5 — Following / Followers Page Queries
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal user fields we need from a following/followers page. */
const USER_FIELDS = `
  id
  name
  siteUrl
  avatar {
    large
    medium
  }
`;

const FOLLOWING_QUERY = `
  query ($userId: Int!, $page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        perPage
      }
      following(userId: $userId, sort: ID) {
        ${USER_FIELDS}
      }
    }
  }
`;

const FOLLOWERS_QUERY = `
  query ($userId: Int!, $page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        perPage
      }
      followers(userId: $userId, sort: ID) {
        ${USER_FIELDS}
      }
    }
  }
`;

// Raw shapes returned by the two queries before we normalise them
interface RawUserNode {
  id:      number;
  name:    string;
  siteUrl: string;
  avatar:  AniListAvatar;
}

interface FollowingPageData {
  Page: {
    pageInfo: PageInfo;
    following: readonly RawUserNode[];
  };
}

interface FollowersPageData {
  Page: {
    pageInfo: PageInfo;
    followers: readonly RawUserNode[];
  };
}

/**
 * Fetch a single page of accounts the viewer is following.
 *
 * @param userId  Viewer's numeric ID.
 * @param page    Page number (1-based).
 * @param token   Bearer token.
 */
export async function fetchFollowingPage(
  userId: number,
  page:   number,
  token:  string,
): Promise<{ pageInfo: PageInfo; users: readonly RawUserNode[] }> {
  const data = await gql<FollowingPageData>(
    FOLLOWING_QUERY,
    { userId, page, perPage: ANILIST_PAGE_SIZE },
    token,
  );
  return {
    pageInfo: data.Page.pageInfo,
    users:    data.Page.following,
  };
}

/**
 * Fetch a single page of accounts that follow the viewer.
 *
 * @param userId  Viewer's numeric ID.
 * @param page    Page number (1-based).
 * @param token   Bearer token.
 */
export async function fetchFollowersPage(
  userId: number,
  page:   number,
  token:  string,
): Promise<{ pageInfo: PageInfo; users: readonly RawUserNode[] }> {
  const data = await gql<FollowersPageData>(
    FOLLOWERS_QUERY,
    { userId, page, perPage: ANILIST_PAGE_SIZE },
    token,
  );
  return {
    pageInfo: data.Page.pageInfo,
    users:    data.Page.followers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6 — Full Paginated List Fetchers (with safety delays)
//
// These functions iterate through ALL pages, applying the configured inter-page
// delay and the burst-cooldown after every 6 pages. They report progress so
// the UI can show a live percentage bar.
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchProgress {
  phase:    string;
  current:  number;
  total:    number; // estimated (AniList total is unreliable) — use as best-guess
}

type ProgressCallback = (p: FetchProgress) => void;

/**
 * Fetch ALL accounts the viewer is currently following.
 * Pages are fetched sequentially with inter-page delays to respect rate limits.
 *
 * @param viewerId  Viewer's numeric user ID.
 * @param token     Bearer token.
 * @param timings   Optional override for delays (ms).
 * @param onProgress  Called after each page completes.
 */
export async function fetchAllFollowing(
  viewerId:   number,
  token:      string,
  timings?: {
    betweenPages?: number;
    afterBurst?:   number;
    burstSize?:    number;
  },
  onProgress?: ProgressCallback,
): Promise<readonly RawUserNode[]> {
  const betweenPages = timings?.betweenPages ?? DEFAULT_TIME_BETWEEN_SCAN_PAGES;
  const afterBurst   = timings?.afterBurst   ?? DEFAULT_TIME_AFTER_SCAN_BURST;
  const burstSize    = timings?.burstSize     ?? 6;

  const allUsers: RawUserNode[] = [];
  let page    = 1;
  let hasNext = true;
  let pagesFetched = 0;

  while (hasNext) {
    const result = await fetchFollowingPage(viewerId, page, token);
    allUsers.push(...result.users);
    hasNext = result.pageInfo.hasNextPage;
    pagesFetched++;

    onProgress?.({
      phase:   'Fetching following list',
      current: allUsers.length,
      total:   allUsers.length + (hasNext ? ANILIST_PAGE_SIZE : 0),
    });

    if (!hasNext) break;

    // Burst cooldown every N pages
    if (pagesFetched % burstSize === 0) {
      await sleep(afterBurst + jitter(3_000));
    } else {
      await sleep(betweenPages + jitter(1_000));
    }

    page++;
  }

  return allUsers;
}

/**
 * Fetch ALL accounts that currently follow the viewer.
 *
 * @param viewerId  Viewer's numeric user ID.
 * @param token     Bearer token.
 * @param timings   Optional override for delays (ms).
 * @param onProgress  Called after each page completes.
 */
export async function fetchAllFollowers(
  viewerId:   number,
  token:      string,
  timings?: {
    betweenPages?: number;
    afterBurst?:   number;
    burstSize?:    number;
  },
  onProgress?: ProgressCallback,
): Promise<readonly RawUserNode[]> {
  const betweenPages = timings?.betweenPages ?? DEFAULT_TIME_BETWEEN_SCAN_PAGES;
  const afterBurst   = timings?.afterBurst   ?? DEFAULT_TIME_AFTER_SCAN_BURST;
  const burstSize    = timings?.burstSize     ?? 6;

  const allUsers: RawUserNode[] = [];
  let page    = 1;
  let hasNext = true;
  let pagesFetched = 0;

  while (hasNext) {
    const result = await fetchFollowersPage(viewerId, page, token);
    allUsers.push(...result.users);
    hasNext = result.pageInfo.hasNextPage;
    pagesFetched++;

    onProgress?.({
      phase:   'Fetching followers list',
      current: allUsers.length,
      total:   allUsers.length + (hasNext ? ANILIST_PAGE_SIZE : 0),
    });

    if (!hasNext) break;

    if (pagesFetched % burstSize === 0) {
      await sleep(afterBurst + jitter(3_000));
    } else {
      await sleep(betweenPages + jitter(1_000));
    }

    page++;
  }

  return allUsers;
}

/**
 * Cross-reference following vs. followers lists and return the merged
 * AniListUser array. Each user gets `isFollowing` and `isFollower` set.
 *
 * @param following  Full list returned by fetchAllFollowing.
 * @param followers  Full list returned by fetchAllFollowers.
 */
export function mergeFollowLists(
  following: readonly RawUserNode[],
  followers: readonly RawUserNode[],
): readonly AniListUser[] {
  const followerIds = new Set(followers.map(u => u.id));
  const followingIds = new Set(following.map(u => u.id));

  const users: AniListUser[] = [];

  for (const u of following) {
    users.push({
      ...u,
      isFollowing: true,
      isFollower:  followerIds.has(u.id),
    });
  }

  // Also include people who follow the viewer but are not followed back
  // (useful for the "follow back" discovery use-case).
  for (const u of followers) {
    if (!followingIds.has(u.id)) {
      users.push({
        ...u,
        isFollowing: false,
        isFollower:  true,
      });
    }
  }

  return users;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7 — Follow / Unfollow Mutation
// ─────────────────────────────────────────────────────────────────────────────

const TOGGLE_FOLLOW_MUTATION = `
  mutation ($userId: Int!) {
    ToggleFollow(userId: $userId) {
      id
      name
      isFollowing
    }
  }
`;

interface ToggleFollowResult {
  ToggleFollow: {
    id:          number;
    name:        string;
    isFollowing: boolean;
  };
}

/**
 * Toggle the follow state for a single user.
 * Returns the new `isFollowing` value as reported by AniList.
 *
 * @param userId  Target user's numeric ID.
 * @param token   Bearer token (required — this is a mutation).
 * @param username Optional username to sync with follow-date tracking.
 */
export async function toggleFollow(userId: number, token: string, username?: string): Promise<boolean> {
  const data = await gql<ToggleFollowResult>(
    TOGGLE_FOLLOW_MUTATION,
    { userId },
    token,
  );
  if (data.ToggleFollow.isFollowing && username) {
    trackFollowNow(userId, username);
  }
  return data.ToggleFollow.isFollowing;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8 — Batch Action Enforcer (5 actions / 5 minutes)
//
// The ActionBatcher is a stateful class that queues individual user IDs and
// executes them respecting the "5 per batch → 5-min cooldown" constraint.
// It is shared between the unfollow flow and the network-follow flow so that
// both obey the same global pacing regardless of which feature triggered them.
// ─────────────────────────────────────────────────────────────────────────────

export type ActionType = 'follow' | 'unfollow';

export interface ActionResult {
  readonly userId:    number;
  readonly username:  string;
  readonly type:      ActionType;
  readonly success:   boolean;
  /** The new isFollowing state after the mutation, if successful. */
  readonly isFollowing?: boolean;
  readonly error?:    string;
}

export type ActionProgressCallback = (
  result:       ActionResult,
  completed:    number,
  total:        number,
  /** If nonzero, the batcher just entered a cooldown period of this many ms. */
  cooldownMs?:  number,
) => void;

export interface BatcherTimings {
  /** ms between individual actions within a batch. Default: 2 000 */
  betweenActions:  number;
  /** ms to sleep after every 5 actions. Default: 300 000 (5 min) */
  afterFiveBatch:  number;
}

const DEFAULT_BATCHER_TIMINGS: BatcherTimings = {
  betweenActions: DEFAULT_TIME_BETWEEN_ACTIONS,
  afterFiveBatch: DEFAULT_TIME_AFTER_FIVE_ACTIONS,
};

/**
 * Execute a list of follow or unfollow actions against the AniList API,
 * strictly enforcing the 5-action/5-minute batch rule.
 *
 * The function:
 *  1. Executes actions one by one with `betweenActions` delay between each.
 *  2. After every 5th action, sleeps for `afterFiveBatch` ms.
 *  3. Reads rate-limit headers via the `gql()` wrapper after each request.
 *  4. Reports each result (success or failure) via `onProgress`.
 *
 * @param users    Ordered list of users to act on (processed front-to-back).
 * @param type     'follow' or 'unfollow'.
 * @param token    Bearer token.
 * @param timings  Optional override for delay values.
 * @param onProgress  Called after each individual action completes.
 * @param isCancelled  Optional abort predicate — checked before each action.
 */
export async function executeBatchedActions(
  users:        readonly Pick<AniListUser, 'id' | 'name'>[],
  type:         ActionType,
  token:        string,
  timings?:     Partial<BatcherTimings>,
  onProgress?:  ActionProgressCallback,
  isCancelled?: () => boolean,
): Promise<readonly ActionResult[]> {
  const timing = { ...DEFAULT_BATCHER_TIMINGS, ...timings };
  const results: ActionResult[] = [];
  const total = users.length;

  for (let i = 0; i < total; i++) {
    // Honour cancellation requests (e.g. user closed the tab)
    if (isCancelled?.()) {
      console.info('[ActionBatcher] Cancelled — stopping batch.');
      break;
    }

    const user = users[i];
    let result: ActionResult;

    try {
      const isFollowingNow = await toggleFollow(user.id, token, user.name);

      // Verify the API returned the state we expected.
      // ToggleFollow is a toggle — so if we wanted to follow, isFollowingNow
      // should be true, and vice-versa.
      const expectedState = type === 'follow';
      const success       = isFollowingNow === expectedState;

      result = {
        userId:      user.id,
        username:    user.name,
        type,
        success,
        isFollowing: isFollowingNow,
      };

      if (!success) {
        // AniList toggled back to an unexpected state (edge case)
        console.warn(
          `[ActionBatcher] ${type} on ${user.name} returned isFollowing=${isFollowingNow} ` +
          `but expected ${expectedState}.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ActionBatcher] Failed to ${type} ${user.name}: ${message}`);
      result = {
        userId:   user.id,
        username: user.name,
        type,
        success:  false,
        error:    message,
      };
    }

    results.push(result);
    onProgress?.(result, results.length, total);

    const isLast = i === total - 1;
    if (isLast) break; // no delay after the final action

    const completedCount = i + 1; // 1-based

    // ── 5-action batch boundary ───────────────────────────────────────────────
    if (completedCount % 5 === 0) {
      const cooldownMs = timing.afterFiveBatch + jitter(5_000); // +jitter up to 5s
      console.info(
        `[ActionBatcher] Completed ${completedCount}/${total} actions. ` +
        `Sleeping ${Math.round(cooldownMs / 60_000)} min (5-per-5-min rule)…`,
      );
      // Notify UI about the cooldown BEFORE sleeping so it can start the countdown.
      onProgress?.(result, results.length, total, cooldownMs);
      await sleep(cooldownMs);
    } else {
      // Standard inter-action delay with small random jitter
      await sleep(timing.betweenActions + jitter(800));
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9 — Global Activity Feed Query + Engagement
// ─────────────────────────────────────────────────────────────────────────────

const GLOBAL_ACTIVITIES_QUERY = `
  query ($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        perPage
      }
      activities(isFollowing: false, sort: ID_DESC, type_in: [TEXT, MEDIA_LIST, ANIME_LIST, MANGA_LIST]) {
        __typename
        ... on ListActivity {
          id
          userId
          likeCount
          user {
            id
            name
            avatar {
              large
              medium
            }
          }
        }
        ... on TextActivity {
          id
          userId
          likeCount
          user {
            id
            name
            avatar {
              large
              medium
            }
          }
        }
      }
    }
  }
`;

/** Raw shape of a supported activity as returned by the query. */
export interface RawActivityNode {
  __typename:  'ListActivity' | 'TextActivity' | 'MessageActivity';
  id:          number;
  type?:       string;
  isLiked?:    boolean;
  createdAt?:  number;
  userId?:     number;
  likeCount?:  number;
  user?: {
    id:     number;
    name:   string;
    avatar: AniListAvatar;
  };
}

interface GlobalActivitiesPageData {
  Page: {
    pageInfo: PageInfo;
    activities: readonly RawActivityNode[];
  };
}

/**
 * Fetch one page of the global (non-following) activity feed.
 *
 * @param page    Page number (1-based).
 * @param token   Bearer token.
 * @param perPage Number of activities per page (max 50).
 */
export async function fetchGlobalActivitiesPage(
  page:    number,
  token:   string,
  perPage: number = 25,
): Promise<{ pageInfo: PageInfo; activities: readonly RawActivityNode[] }> {
  const data = await gql<GlobalActivitiesPageData>(
    GLOBAL_ACTIVITIES_QUERY,
    { page, perPage },
    token,
  );

  const activities = data.Page.activities.filter(
    (a): a is RawActivityNode => 
      a.__typename === 'ListActivity' || 
      a.__typename === 'TextActivity' || 
      a.__typename === 'MessageActivity'
  );

  return {
    pageInfo:   data.Page.pageInfo,
    activities: activities,
  };
}

// ── Like Mutation ──────────────────────────────────────────────────────────────

const TOGGLE_LIKE_MUTATION = `
  mutation ($id: Int!, $type: LikeableType!) {
    ToggleLikeV2(id: $id, type: $type) {
      ... on ListActivity {
        id
        likeCount
        isLiked
      }
      ... on TextActivity {
        id
        likeCount
        isLiked
      }
      ... on MessageActivity {
        id
        likeCount
        isLiked
      }
    }
  }
`;

interface ToggleLikeResult {
  ToggleLikeV2: {
    id:        number;
    likeCount: number;
    isLiked:   boolean;
  } | null;
}

/**
 * Like (or unlike) a ListActivity.
 * Returns true if the activity is now liked.
 *
 * @param activityId  Numeric activity ID.
 * @param token       Bearer token.
 */
export async function likeActivity(activityId: number, token: string): Promise<boolean> {
  const data = await gql<ToggleLikeResult>(
    TOGGLE_LIKE_MUTATION,
    { id: activityId, type: 'ACTIVITY' },
    token,
  );
  return data.ToggleLikeV2?.isLiked ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 10 — Target User Network Fetcher (for "Follow from Network" feature)
//
// Fetches either the followers or the following list of an arbitrary target
// user (by their numeric ID), page by page in order (most recent first).
// Skips users the viewer is already following (passed in as a Set).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch one page of a target user's following list.
 * We re-use the same FOLLOWING_QUERY because `userId` is a parameter.
 */
export async function fetchTargetUserFollowingPage(
  targetUserId: number,
  page:         number,
  token:        string,
): Promise<{ pageInfo: PageInfo; users: readonly RawUserNode[] }> {
  const data = await gql<FollowingPageData>(
    FOLLOWING_QUERY,
    { userId: targetUserId, page, perPage: ANILIST_PAGE_SIZE },
    token,
  );
  return {
    pageInfo: data.Page.pageInfo,
    users:    data.Page.following,
  };
}

/**
 * Fetch one page of a target user's followers list.
 */
export async function fetchTargetUserFollowersPage(
  targetUserId: number,
  page:         number,
  token:        string,
): Promise<{ pageInfo: PageInfo; users: readonly RawUserNode[] }> {
  const data = await gql<FollowersPageData>(
    FOLLOWERS_QUERY,
    { userId: targetUserId, page, perPage: ANILIST_PAGE_SIZE },
    token,
  );
  return {
    pageInfo: data.Page.pageInfo,
    users:    data.Page.followers,
  };
}

/**
 * Look up a user by their username and return their numeric ID.
 *
 * @param username  AniList username string (case-insensitive on their side).
 * @param token     Bearer token (improves accuracy for private profiles).
 */
const USER_BY_NAME_QUERY = `
  query ($name: String!) {
    User(name: $name) {
      id
      name
      avatar {
        large
        medium
      }
      siteUrl
    }
  }
`;

interface UserByNameResult {
  User: RawUserNode;
}

export async function fetchUserByName(
  username: string,
  token:    string,
): Promise<RawUserNode> {
  console.log(`[AniFollows] Looking up user: "${username}"`);
  const data = await gql<UserByNameResult>(
    USER_BY_NAME_QUERY,
    { name: username },
    token,
  );
  return data.User;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 11 — Engagement Runner
//
// Bundles the global-feed engagement logic (like + follow) into a single
// callable function so activity-engager.ts stays thin.
// ─────────────────────────────────────────────────────────────────────────────

export interface EngagementProgress {
  phase:      string;
  liked:      number;
  followed:   number;
  skipped:    number;
  cooldownMs?: number;
}

export type EngagementProgressCallback = (p: EngagementProgress) => void;

/**
 * Run one engagement session against the global AniList activity feed.
 *
 * Rules applied:
 *  - Only engage with `ListActivity` entries.
 *  - Only like activities with `likeCount >= GLOBAL_FEED_MIN_LIKES`.
 *  - Hard-stop at `GLOBAL_FEED_MAX_LIKES_PER_SESSION` likes per session.
 *  - Follow the activity's author if not already following (pass `alreadyFollowing`
 *    Set to avoid duplicates). Follows are counted against the same 5/5-min batch.
 *  - A 2-second delay is applied between every individual action (like OR follow)
 *    and a 5-minute cooldown after every 5 combined actions.
 *
 * @param token            Bearer token.
 * @param alreadyFollowing Set of user IDs the viewer is already following.
 * @param onProgress       Live progress callback.
 * @param isCancelled      Optional abort predicate.
 */
export async function runEngagementSession(
  token:            string,
  alreadyFollowing: ReadonlySet<number>,
  onProgress?:      EngagementProgressCallback,
  isCancelled?:     () => boolean,
): Promise<EngagementProgress> {
  const progress: EngagementProgress = {
    liked: 0, followed: 0, skipped: 0, phase: 'Starting…',
  };

  // Track users we followed in this session so we don't double-follow if
  // they appear multiple times in the feed.
  const followedThisSession = new Set<number>();

  // Combined action counter for the 5/5-min batch rule
  let actionCount = 0;

  const doAction = async (label: string, fn: () => Promise<void>) => {
    if (isCancelled?.()) return;

    const isFirst = actionCount === 0;

    // Wait before the action (unless it's literally the first one)
    if (!isFirst) {
      if (actionCount % 5 === 0) {
        const cooldownMs = DEFAULT_TIME_AFTER_FIVE_ACTIONS + jitter(5_000);
        progress.phase = 'Cooling down (5-min batch pause)…';
        progress.cooldownMs = cooldownMs;
        onProgress?.({ ...progress });
        await sleep(cooldownMs);
        progress.cooldownMs = undefined; // clear it for next progress updates
      } else {
        await sleep(DEFAULT_TIME_BETWEEN_ACTIONS + jitter(800));
      }
    }

    try {
      await fn();
      console.info(`[Engagement] ${label}`);
    } catch (err) {
      console.warn(`[Engagement] Failed: ${label}`, err);
    }

    actionCount++;
  };

  let page    = 1;
  let hasNext = true;

  outer:
  while (hasNext && progress.liked < GLOBAL_FEED_MAX_LIKES_PER_SESSION) {
    if (isCancelled?.()) break;

    progress.phase = `Fetching global feed page ${page}…`;
    onProgress?.({ ...progress });

    const result = await fetchGlobalActivitiesPage(page, token, 25);
    hasNext = result.pageInfo.hasNextPage;

    for (const activity of result.activities) {
      if (isCancelled?.()) break outer;
      if (progress.liked >= GLOBAL_FEED_MAX_LIKES_PER_SESSION) break outer;

      // Filter: must meet minimum like threshold
      if ((activity.likeCount ?? 0) < GLOBAL_FEED_MIN_LIKES) {
        progress.skipped++;
        continue;
      }

      // ── Like the activity ────────────────────────────────────────────────
      progress.phase = `Liking activity #${activity.id} (${activity.likeCount ?? 0} likes)…`;
      onProgress?.({ ...progress });

      await doAction(`Like activity #${activity.id}`, async () => {
        const isLiked = await likeActivity(activity.id, token);
        if (isLiked) progress.liked++;
      });

      // ── Follow the author if not already ────────────────────────────────
      const authorId = activity.userId;
      if (
        authorId &&
        activity.user &&
        !alreadyFollowing.has(authorId) &&
        !followedThisSession.has(authorId)
      ) {
        progress.phase = `Following ${activity.user.name}…`;
        onProgress?.({ ...progress });

        await doAction(`Follow author ${authorId}`, async () => {
          const isNowFollowing = await toggleFollow(authorId, token, activity.user!.name);
          if (isNowFollowing) {
            followedThisSession.add(authorId);
            progress.followed++;
          }
        });
      }
    }

    // Inter-page delay before fetching the next activity page
    if (hasNext && progress.liked < GLOBAL_FEED_MAX_LIKES_PER_SESSION) {
      await sleep(DEFAULT_TIME_BETWEEN_SCAN_PAGES + jitter(1_500));
      page++;
    }
  }

  progress.phase = 'Engagement session complete.';
  onProgress?.({ ...progress });
  return progress;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 12 — Network Follow Runner
//
// Fetches a target user's network (followers OR following, most-recent-first)
// and follows each person that:
//   a) is not already in the viewer's own following list (alreadyFollowing Set)
//   b) is not in the whitelist
//
// Returns the list of users that were followed.
// ─────────────────────────────────────────────────────────────────────────────

export interface NetworkFollowProgress {
  phase:        string;
  followed:     number;
  skipped:      number;
  total:        number;
  /** If nonzero, a 5-action cooldown just started and lasts this many ms. */
  cooldownMs?:  number;
}

export type NetworkFollowProgressCallback = (p: NetworkFollowProgress) => void;

export type NetworkFollowMode = 'followers' | 'following';

/**
 * Follow users from a target user's network in page order (most recent first).
 *
 * @param targetUserId    Numeric ID of the target user.
 * @param mode            'followers' | 'following'
 * @param token           Bearer token.
 * @param alreadyFollowing  Set of IDs the viewer is already following.
 * @param whitelistedIds  Set of IDs that must never be followed.
 * @param maxToFollow     Hard cap on follows in this session.
 * @param timings         Optional delay overrides.
 * @param onProgress      Live progress callback.
 * @param isCancelled     Optional abort predicate.
 */
export async function runNetworkFollowSession(
  targetUserId:    number,
  mode:            NetworkFollowMode,
  token:           string,
  alreadyFollowing: ReadonlySet<number>,
  whitelistedIds:  ReadonlySet<number>,
  maxToFollow:     number = 50,
  timings?:        Partial<BatcherTimings>,
  onProgress?:     NetworkFollowProgressCallback,
  isCancelled?:    () => boolean,
): Promise<readonly RawUserNode[]> {
  const timing = { ...DEFAULT_BATCHER_TIMINGS, ...timings };
  const followed: RawUserNode[] = [];
  const followedThisSession = new Set<number>();

  let page       = 1; // Start from page 1 = most recent first
  let hasNext    = true;
  let actionCount = 0;
  let skipped    = 0;

  outer:
  while (hasNext && followed.length < maxToFollow) {
    if (isCancelled?.()) break;

    onProgress?.({
      phase:    `Scanning ${mode} page ${page}…`,
      followed: followed.length,
      skipped,
      total:    followed.length + skipped,
    });

    // Fetch a page of the target's network
    const result = mode === 'followers'
      ? await fetchTargetUserFollowersPage(targetUserId, page, token)
      : await fetchTargetUserFollowingPage(targetUserId, page, token);

    hasNext = result.pageInfo.hasNextPage;

    // Inter-page delay
    if (hasNext) {
      await sleep(DEFAULT_TIME_BETWEEN_SCAN_PAGES + jitter(1_000));
    }

    for (const user of result.users) {
      if (isCancelled?.()) break outer;
      if (followed.length >= maxToFollow) break outer;

      // Skip if already following, whitelisted, or followed in this session
      if (
        alreadyFollowing.has(user.id)     ||
        whitelistedIds.has(user.id)       ||
        followedThisSession.has(user.id)
      ) {
        skipped++;
        continue;
      }

      // ── Apply 5-action / 5-min batch rule ─────────────────────────────
      const isFirst = actionCount === 0;
      if (!isFirst) {
        if (actionCount % 5 === 0) {
          onProgress?.({
            phase:    'Cooling down (5-min batch pause)…',
            followed: followed.length,
            skipped,
            total:    followed.length + skipped,
          });
          await sleep(timing.afterFiveBatch + jitter(5_000));
        } else {
          await sleep(timing.betweenActions + jitter(800));
        }
      }

      onProgress?.({
        phase:    `Following ${user.name}…`,
        followed: followed.length,
        skipped,
        total:    followed.length + skipped,
      });

      try {
        const isNowFollowing = await toggleFollow(user.id, token, user.name);
        if (isNowFollowing) {
          followed.push(user);
          followedThisSession.add(user.id);
          actionCount++;
        } else {
          // Toggle returned false = we accidentally unfollowed (race condition)
          // Re-toggle to fix
          console.warn(`[NetworkFollow] Toggle returned false for ${user.name}, re-toggling.`);
          await toggleFollow(user.id, token, user.name);
          followed.push(user);
          followedThisSession.add(user.id);
          actionCount++;
        }
      } catch (err) {
        console.error(`[NetworkFollow] Failed to follow ${user.name}:`, err);
        skipped++;
      }
    }

    page++;
  }

  onProgress?.({
    phase:    'Network follow session complete.',
    followed: followed.length,
    skipped,
    total:    followed.length + skipped,
  });

  return followed;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 13 — Exported rate-limit state accessor (for UI display / debugging)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the current rate-limit state (read-only snapshot). */
export function getRateLimitState(): Readonly<RateLimitState> {
  return { ...rateLimitState };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 14 — Targeted Engagement Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface TargetedEngagementProgressCallback {
  (progress: {
    phase: string;
    processedUsers: number;
    totalUsers: number;
    likedActivities: number;
    skippedActivities: number;
    cooldownMs?: number;
  }): void;
}

/**
 * Fetches recent activities for a specific user.
 */
export async function fetchUserActivities(
  userId: number,
  includeMessages: boolean,
  limit: number,
  token: string
): Promise<RawActivityNode[]> {
  // NOTE: ActivityType valid values are TEXT, ANIME_LIST, MANGA_LIST.
  // MEDIA_LIST is NOT a valid ActivityType — it was removed to prevent API errors.
  const query = `
    query($userId: Int, $typeIn: [ActivityType], $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        activities(userId: $userId, type_in: $typeIn, sort: ID_DESC) {
          ... on TextActivity { id type isLiked createdAt }
          ... on ListActivity { id type isLiked createdAt }
          ... on MessageActivity { id type isLiked createdAt }
        }
      }
    }
  `;
  // Exclude message activities unless user opts in
  const typeIn = includeMessages ? undefined : ['TEXT', 'ANIME_LIST', 'MANGA_LIST'];
  const variables = { userId, typeIn, perPage: limit };
  const res = await gql<any>(query, variables, token);
  return (res.Page.activities || []).filter((a: any) => a !== null) as RawActivityNode[];
}

/**
 * Fetches users who have liked at least `minLikes` activities in the past `hours`.
 */
export async function fetchRecentLikers(
  hours: number,
  minLikes: number,
  token: string
): Promise<RawUserNode[]> {
  const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);
  const userLikes = new Map<number, { user: RawUserNode, count: number }>();
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const query = `
      query($page: Int) {
        Page(page: $page, perPage: 50) {
          pageInfo { hasNextPage }
          notifications(type_in: [ACTIVITY_LIKE, ACTIVITY_REPLY_LIKE]) {
            ... on ActivityLikeNotification {
              createdAt
              user { id name avatar { medium } }
            }
            ... on ActivityReplyLikeNotification {
              createdAt
              user { id name avatar { medium } }
            }
          }
        }
      }
    `;
    const res = await gql<any>(query, { page }, token);
    const notifications = res.Page.notifications || [];
    hasNext = res.Page.pageInfo.hasNextPage;

    let reachedCutoff = false;
    for (const notif of notifications) {
      if (!notif) continue;
      if (notif.createdAt < cutoffTime) {
        reachedCutoff = true;
        break;
      }
      if (notif.user) {
        const entry = userLikes.get(notif.user.id) || { user: notif.user, count: 0 };
        entry.count++;
        userLikes.set(notif.user.id, entry);
      }
    }

    if (reachedCutoff) break;
    
    if (hasNext) {
       await sleep(DEFAULT_TIME_BETWEEN_SCAN_PAGES);
    }
    page++;
  }

  const result: RawUserNode[] = [];
  for (const [_, entry] of Array.from(userLikes.entries())) {
    if (entry.count >= minLikes) {
      result.push(entry.user);
    }
  }
  return result;
}

/**
 * Runs the targeted engagement session.
 */
export async function runTargetedEngagementSession(
  targetUsers: readonly RawUserNode[],
  config: {
    activitiesPerUser: number;
    includeMessages: boolean;
  },
  timings: Partial<BatcherTimings>,
  token: string,
  onProgress: TargetedEngagementProgressCallback,
  isCancelled: () => boolean
): Promise<void> {
  const timing = { ...DEFAULT_BATCHER_TIMINGS, ...timings };
  let processedUsers = 0;
  let likedActivities = 0;
  let skippedActivities = 0;
  let actionCount = 0;

  for (const user of targetUsers) {
    if (isCancelled()) break;

    onProgress({
      phase: `Fetching activities for ${user.name}...`,
      processedUsers,
      totalUsers: targetUsers.length,
      likedActivities,
      skippedActivities,
    });

    try {
      const activities = await fetchUserActivities(user.id, config.includeMessages, 25, token);
      const unliked = activities.filter(a => !a.isLiked);
      
      let likedForThisUser = 0;
      for (const activity of unliked) {
        if (isCancelled()) break;
        if (likedForThisUser >= config.activitiesPerUser) break;

        // Apply 5-action batch rule with pacing
        if (actionCount > 0) {
          if (actionCount % 5 === 0) {
            const cooldownMs = timing.afterFiveBatch + jitter(5_000);
            onProgress({
              phase: 'Cooling down (5-min batch pause)...',
              processedUsers,
              totalUsers: targetUsers.length,
              likedActivities,
              skippedActivities,
              cooldownMs,
            });
            await sleep(cooldownMs);
          } else {
            await sleep(timing.betweenActions + jitter(800));
          }
        }

        onProgress({
          phase: `Liking activity for ${user.name}...`,
          processedUsers,
          totalUsers: targetUsers.length,
          likedActivities,
          skippedActivities,
        });

        const isNowLiked = await likeActivity(activity.id, token);
        if (isNowLiked) {
          likedActivities++;
          likedForThisUser++;
          actionCount++;
        } else {
          skippedActivities++;
        }
      }
    } catch (err) {
      console.error(`[TargetedEngagement] Failed processing ${user.name}:`, err);
    }

    processedUsers++;

    // Inter-user delay: always wait between users to avoid hammering the API
    // when the resolution phase fetches activities for each user sequentially.
    if (processedUsers < targetUsers.length && !isCancelled()) {
      await sleep(DEFAULT_TIME_BETWEEN_SCAN_PAGES + jitter(1_000));
    }
  }

  onProgress({
    phase: 'Targeted engagement session complete.',
    processedUsers,
    totalUsers: targetUsers.length,
    likedActivities,
    skippedActivities,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// § Activity Enrichment — "Has Posted Since Follow" Detection
//
// After a scan completes, for each user in our follow-history (users we followed
// via this app), we query their most recent AniList activity. If createdAt is
// AFTER our followedAt timestamp, they have been active since we followed them.
// This enables the POSTED_NO_FOLLOWBACK 24h rule, mirroring the Instagram logic.
// ─────────────────────────────────────────────────────────────────────────────

const LATEST_ACTIVITY_QUERY = `
  query ($userId: Int!) {
    Page(page: 1, perPage: 1) {
      activities(userId: $userId, sort: ID_DESC, type_in: [TEXT, ANIME_LIST, MANGA_LIST]) {
        ... on ListActivity  { createdAt }
        ... on TextActivity  { createdAt }
      }
    }
  }
`;

interface LatestActivityData {
  Page: {
    activities: Array<{ createdAt: number }>;
  };
}

/**
 * Fetch the createdAt timestamp (Unix seconds) of a user's most recent activity.
 * Returns null if the user has no activity or the query fails.
 * This is a read-only, lightweight query (1 request per user).
 */
export async function fetchLatestActivityTimestamp(
  userId: number,
  token: string,
): Promise<number | null> {
  try {
    const data = await gql<LatestActivityData>(LATEST_ACTIVITY_QUERY, { userId }, token);
    const activities = data.Page.activities;
    if (!activities || activities.length === 0) return null;
    return activities[0].createdAt; // Unix seconds from AniList
  } catch (err) {
    console.warn(`[Enrichment] Failed to fetch activity for user ${userId}:`, err);
    return null;
  }
}

import { FollowHistoryEntry } from '../model/follow-history';
import { updateFollowEntry } from './follow-history-manager';

export interface EnrichmentProgress {
  checked: number;
  total:   number;
  updated: number; // how many had hasPostedSinceFollow flipped to true
}

/**
 * Background enrichment pass: for each tracked-follow entry, check if the
 * user has posted on AniList since we followed them.
 *
 * - Only processes users still in the scan results (identified by userId).
 * - Skips entries where `hasPostedSinceFollow` is already true (no need to re-check).
 * - Skips entries checked within the last 2 hours to avoid redundant API calls.
 * - Applies `DEFAULT_TIME_BETWEEN_SCAN_PAGES` delay between each check.
 *
 * @param entries      Subset of FollowHistoryEntry records to enrich.
 * @param token        Bearer token.
 * @param onProgress   Called after each user is checked.
 * @param isCancelled  Abort predicate.
 */
export async function enrichFollowHistoryWithActivity(
  entries: readonly FollowHistoryEntry[],
  token: string,
  onProgress?: (p: EnrichmentProgress) => void,
  isCancelled?: () => boolean,
): Promise<void> {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();

  // Filter to entries that are worth checking:
  // - Not already confirmed as posted (skip if already true)
  // - Not checked recently (within 2h)
  // - Within 96h (the auto-unfollow tracking window)
  const toCheck = entries.filter(e => {
    if (e.hasPostedSinceFollow) return false; // already confirmed
    if (e.lastActivityCheckedAt && now - e.lastActivityCheckedAt < TWO_HOURS_MS) return false;
    if (now - e.followedAt > 96 * 60 * 60 * 1000) return false; // too old
    return true;
  });

  let checked = 0;
  let updated = 0;

  for (const entry of toCheck) {
    if (isCancelled?.()) break;

    const latestCreatedAtSec = await fetchLatestActivityTimestamp(entry.userId, token);
    const checkedAt = Date.now();

    if (latestCreatedAtSec !== null) {
      // AniList returns Unix seconds; followedAt is Unix ms
      const latestMs = latestCreatedAtSec * 1000;
      const hasPosted = latestMs > entry.followedAt;

      if (hasPosted) {
        updateFollowEntry(entry.userId, {
          hasPostedSinceFollow: true,
          lastActivityCheckedAt: checkedAt,
        });
        updated++;
      } else {
        updateFollowEntry(entry.userId, { lastActivityCheckedAt: checkedAt });
      }
    } else {
      // No activity found — record that we checked to avoid re-querying too soon
      updateFollowEntry(entry.userId, { lastActivityCheckedAt: checkedAt });
    }

    checked++;
    onProgress?.({ checked, total: toCheck.length, updated });

    if (checked < toCheck.length && !isCancelled?.()) {
      await sleep(DEFAULT_TIME_BETWEEN_SCAN_PAGES + jitter(500));
    }
  }
}
