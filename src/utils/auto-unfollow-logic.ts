import { AniListUser, UnfollowCandidate, UnfollowReason, FollowHistoryEntry } from '../model/anilist-user';
import { AUTO_UNFOLLOW_HOURS_SOFT, AUTO_UNFOLLOW_HOURS_HARD } from '../constants/constants';

export function shouldUnfollowUser(
  user: AniListUser,
  followEntry: FollowHistoryEntry
): UnfollowCandidate | null {
  const hoursSinceFollow = (Date.now() - followEntry.followedAt) / (1000 * 60 * 60);

  // Only process if within 4 days (96 hours). Older entries require manual intervention.
  if (hoursSinceFollow > 96) {
    return null; 
  }

  // If they already followed back, we don't auto-unfollow them based on time.
  if (user.isFollower) {
    return null;
  }

  // ── POSTED_NO_FOLLOWBACK (24h + posted + no followback) ──────────────────────
  // Mirrors Instagram's POSTED_NO_FOLLOWBACK exactly:
  // If 24h have passed AND the user posted on AniList AFTER we followed them
  // AND they still haven't followed back → highest-priority 24h candidate.
  if (hoursSinceFollow >= AUTO_UNFOLLOW_HOURS_SOFT && followEntry.hasPostedSinceFollow) {
    return {
      user,
      reason: UnfollowReason.POSTED_NO_FOLLOWBACK,
      followEntry,
      hoursSinceFollow,
    };
  }

  // ── TIMEOUT_48H (48h hard timeout regardless of posting) ─────────────────────
  if (hoursSinceFollow >= AUTO_UNFOLLOW_HOURS_HARD) {
    return {
      user,
      reason: UnfollowReason.TIMEOUT_48H,
      followEntry,
      hoursSinceFollow,
    };
  }

  // ── TIMEOUT_24H (24h soft timeout, no activity enrichment yet) ───────────────
  // hasPostedSinceFollow is undefined/false, but 24h has passed.
  // This is the fallback for users where activity hasn't been checked yet.
  if (hoursSinceFollow >= AUTO_UNFOLLOW_HOURS_SOFT) {
    return {
      user,
      reason: UnfollowReason.TIMEOUT_24H,
      followEntry,
      hoursSinceFollow,
    };
  }

  return null;
}

export function getUnfollowCandidates(
  users: readonly AniListUser[],
  followHistory: readonly FollowHistoryEntry[]
): UnfollowCandidate[] {
  const candidates: UnfollowCandidate[] = [];

  for (const user of users) {
    const followEntry = followHistory.find(entry => entry.userId === user.id);
    if (!followEntry) continue;

    const candidate = shouldUnfollowUser(user, followEntry);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

export function getUnfollowReasonLabel(reason: UnfollowReason): string {
  switch (reason) {
    case UnfollowReason.POSTED_NO_FOLLOWBACK:
      return 'Posted but no followback (24h+)';
    case UnfollowReason.TIMEOUT_24H:
      return '24h+ (No follow back)';
    case UnfollowReason.TIMEOUT_48H:
      return '48h+ Timeout (No follow back)';
    default:
      return 'Unknown';
  }
}

export function getUnfollowReasonBadge(reason: UnfollowReason): { emoji: string; text: string } {
  switch (reason) {
    case UnfollowReason.POSTED_NO_FOLLOWBACK:
      return { emoji: '📢', text: '24h+ Posted' };
    case UnfollowReason.TIMEOUT_24H:
      return { emoji: '⏳', text: '24h+ Timeout' };
    case UnfollowReason.TIMEOUT_48H:
      return { emoji: '⏰', text: '48h+ Timeout' };
    default:
      return { emoji: '⚠️', text: 'Auto-Unfollow' };
  }
}
