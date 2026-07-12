import { AniListUser } from "../model/anilist-user";
import { USERS_PER_PAGE } from "../constants/constants";
import { ScanningTab } from "../model/scanning-tab";
import { ScanningFilter } from "../model/scanning-filter";
import { UnfollowLogEntry } from "../model/unfollow-log-entry";
import { UnfollowFilter } from "../model/unfollow-filter";

export async function copyListToClipboard(usersList: readonly AniListUser[]): Promise<void> {
  const sortedList = [...usersList].sort((a, b) => (a.name > b.name ? 1 : -1));

  let output = '';
  sortedList.forEach(user => {
    output += user.name + '\n';
  });

  await navigator.clipboard.writeText(output);
  alert('List copied to clipboard!');
}

export function exportToJSON(users: readonly AniListUser[]) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(users, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href",     dataStr);
  downloadAnchorNode.setAttribute("download", `anilist_users_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export function exportToCSV(users: readonly AniListUser[]) {
  const headers = ['id', 'name', 'site_url', 'is_following', 'is_follower'];
  const rows = users.map(user => [
    user.id,
    user.name,
    user.siteUrl,
    user.isFollowing,
    user.isFollower
  ]);
  
  const csvContent = "data:text/csv;charset=utf-8," 
    + headers.join(",") + "\n" 
    + rows.map(e => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `anilist_users_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function getMaxPage(usersList: readonly AniListUser[]): number {
  const pageCalc = Math.ceil(usersList.length / USERS_PER_PAGE);
  return pageCalc < 1 ? 1 : pageCalc;
}

export function getCurrentPageUsers(usersList: readonly AniListUser[], currentPage: number): readonly AniListUser[] {
  const sortedList = [...usersList].sort((a, b) => (a.name > b.name ? 1 : -1));
  return sortedList.splice(USERS_PER_PAGE * (currentPage - 1), USERS_PER_PAGE);
}

export function getUsersForDisplay(
  results: readonly AniListUser[],
  whitelistedResults: readonly AniListUser[],
  currentTab: ScanningTab,
  searchTerm: string,
  filter: ScanningFilter,
  autoUnfollowUserIds?: ReadonlySet<number>,
): readonly AniListUser[] {
  const users: AniListUser[] = [];
  for (const result of results) {
    const isWhitelisted = whitelistedResults.find(user => user.id === result.id) !== undefined;
    switch (currentTab) {
      case "non_whitelisted":
        if (isWhitelisted) {
          continue;
        }
        break;
      case "whitelisted":
        if (!isWhitelisted) {
          continue;
        }
        break;
      default:
        assertUnreachable(currentTab);
    }
    
    if (!filter.showFollowers && result.isFollower) {
      continue;
    }
    if (!filter.showNonFollowers && !result.isFollower) {
      continue;
    }

    if (filter.showAutoUnfollowOnly && autoUnfollowUserIds && !autoUnfollowUserIds.has(result.id)) {
      continue;
    }
    
    const userMatchesSearchTerm = result.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (searchTerm !== "" && !userMatchesSearchTerm) {
      continue;
    }
    users.push(result);
  }
  return users;
}

export function getUnfollowLogForDisplay(log: readonly UnfollowLogEntry[], searchTerm: string, filter: UnfollowFilter) {
  const entries: UnfollowLogEntry[] = [];
  for (const entry of log) {
    if (!filter.showSucceeded && entry.unfollowedSuccessfully) {
      continue;
    }
    if (!filter.showFailed && !entry.unfollowedSuccessfully) {
      continue;
    }
    const userMatchesSearchTerm = entry.user.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (searchTerm !== "" && !userMatchesSearchTerm) {
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * When writing a switch-case with a finite number of cases, use this function in the
 * `default` clause of switch-case statements for exhaustive checking.
 */
export function assertUnreachable(_value: never): never {
  throw new Error('Statement should be unreachable');
}
