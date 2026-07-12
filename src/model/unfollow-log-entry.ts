// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Unfollow Log Entry Model
// ─────────────────────────────────────────────────────────────────────────────
import { AniListUser } from './anilist-user';

export interface UnfollowLogEntry {
  readonly user:                  AniListUser;
  readonly unfollowedSuccessfully: boolean;
  /** Error message if the unfollow failed. */
  readonly error?:                string;
}
