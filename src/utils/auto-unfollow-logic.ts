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
  // (EGO_AURA ratio check was removed per spec).
  if (user.isFollower) {
    return null;
  }

  // 48 hours regardless + no followback (Hard Timeout)
  if (hoursSinceFollow >= AUTO_UNFOLLOW_HOURS_HARD) {
    return {
      user,
      reason: UnfollowReason.TIMEOUT_48H,
      followEntry,
      hoursSinceFollow,
    };
  }

  // 24 hours + no followback (Soft Timeout)
  // For AniList, since we don't have "post detection" to serve as an activity ping,
  // we default to flagging them after 24h as a soft timeout. The user can still
  // manually decide whether to execute the unfollow.
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
    case UnfollowReason.TIMEOUT_24H:
      return { emoji: '⏳', text: '24h+ Timeout' };
    case UnfollowReason.TIMEOUT_48H:
      return { emoji: '⏰', text: '48h+ Timeout' };
    default:
      return { emoji: '⚠️', text: 'Auto-Unfollow' };
  }
}
