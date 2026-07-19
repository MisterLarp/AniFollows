
import { FollowHistoryEntry, FollowDateSource } from '../model/anilist-user';
import {
  addFollowEntry,
  loadFollowHistory,
  saveFollowHistory,
} from './follow-history-manager';

export const FOLLOWING_SNAPSHOT_STORAGE_KEY = 'anifollows_following_snapshot';

export interface FollowingSnapshot {
  readonly userIds: readonly number[];
  readonly scannedAt: number;
}

export interface SyncProgress {
  readonly phase: string;
  readonly current: number;
  readonly total: number;
}

function loadFollowingSnapshot(): FollowingSnapshot | null {
  try {
    const raw = localStorage.getItem(FOLLOWING_SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as FollowingSnapshot;
  } catch {
    return null;
  }
}

function saveFollowingSnapshot(snapshot: FollowingSnapshot): void {
  localStorage.setItem(FOLLOWING_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
}

function upsertEntry(
  userId: number,
  username: string,
  followedAt: number,
  source: FollowDateSource,
): void {
  addFollowEntry(userId, username, {
    followedAt,
    followDateSource: source,
  });
}

/** 
 * AniList following lists are roughly reverse-chronological (newest first).
 */
export function estimateFollowDateFromListIndex(
  index: number,
  totalCount: number,
  scanCompletedAt: number,
): number {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const total = Math.max(totalCount, 1);
  // Spread estimates across up to 30 days for the full list
  const maxSpreadMs = Math.min(30 * MS_DAY, total * 60 * 60 * 1000);
  const msPerIndex = maxSpreadMs / total;
  return scanCompletedAt - index * msPerIndex;
}

/**
 * Sync follow history for everyone in the following scan:
 * - Snapshot diff (new follows since last scan, including other devices)
 * - List-order estimate as fallback (newest follows first)
 */
export async function syncFollowHistoryFromFollowingList(
  results: readonly { id: number, name: string }[],
  scanCompletedAt: number,
  onProgress?: (progress: SyncProgress) => void,
): Promise<number> {
  if (results.length === 0) {
    return 0;
  }

  const history = loadFollowHistory() || { entries: [] };
  const knownIds = new Set(history.entries.map(e => e.userId));
  const prevSnapshot = loadFollowingSnapshot();
  const prevIds = new Set(prevSnapshot?.userIds ?? []);
  let added = 0;

  onProgress?.({ phase: 'Detecting new follows since last scan…', current: 0, total: results.length });

  // Cross-device / new follows: appeared since last snapshot
  for (let index = 0; index < results.length; index++) {
    const user = results[index];
    if (prevIds.has(user.id) || knownIds.has(user.id)) {
      continue;
    }

    const followedAt =
      index < 48
        ? scanCompletedAt - index * 60 * 60 * 1000
        : estimateFollowDateFromListIndex(index, results.length, scanCompletedAt);

    upsertEntry(user.id, user.name, followedAt, 'snapshot');
    knownIds.add(user.id);
    added++;
  }

  saveFollowingSnapshot({
    userIds: results.map(r => r.id),
    scannedAt: scanCompletedAt,
  });

  const missing = results.filter(r => !knownIds.has(r.id));
  if (missing.length === 0) {
    return added;
  }

  onProgress?.({
    phase: 'Estimating follow dates from list order…',
    current: 0,
    total: missing.length,
  });

  for (let i = 0; i < missing.length; i++) {
    const user = missing[i];
    const index = results.findIndex(r => r.id === user.id);
    const followedAt = estimateFollowDateFromListIndex(index >= 0 ? index : i, results.length, scanCompletedAt);

    upsertEntry(user.id, user.name, followedAt, 'estimated');
    knownIds.add(user.id);
    added++;

    if (i > 0 && i % 50 === 0) {
      onProgress?.({
        phase: 'Estimating follow dates from list order…',
        current: i,
        total: missing.length,
      });
      // Simulate small delay so UI doesn't completely freeze if list is huge
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return added;
}

export function trackFollowNow(userId: number, username: string): void {
  upsertEntry(userId, username, Date.now(), 'live');
}

export function getFollowEntryForUser(userId: number): FollowHistoryEntry | null {
  const history = loadFollowHistory();
  return history?.entries.find(e => e.userId === userId) ?? null;
}

export function pruneFollowHistoryToCurrentFollowing(currentUserIds: ReadonlySet<number>): void {
  const history = loadFollowHistory();
  if (!history) {
    return;
  }
  const pruned = {
    entries: history.entries.filter(e => currentUserIds.has(e.userId)),
  };
  saveFollowHistory(pruned);
}
