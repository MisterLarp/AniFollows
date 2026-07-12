import { AniListUser } from '../model/anilist-user';
import { Timings } from '../model/timings';
import { WHITELISTED_RESULTS_STORAGE_KEY, TIMINGS_STORAGE_KEY } from '../constants/constants';

/**
 * Export whitelist to a JSON file
 */
export const exportWhitelist = (whitelistedUsers: readonly AniListUser[]): void => {
  if (whitelistedUsers.length === 0) {
    alert('No users in whitelist to export');
    return;
  }

  const dataStr = JSON.stringify(whitelistedUsers, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `anilist-whitelist-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

/**
 * Import whitelist from a JSON file
 */
export const importWhitelist = (
  file: File,
  onSuccess: (users: readonly AniListUser[]) => void,
  onError: (message: string) => void
): void => {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const importedUsers = JSON.parse(content) as AniListUser[];
      
      // Validate the imported data
      if (!Array.isArray(importedUsers)) {
        onError('Invalid file format: Expected an array of users');
        return;
      }
      
      // Basic validation of user structure
      const isValid = importedUsers.every(user => 
        user.id !== undefined && 
        user.name !== undefined && 
        typeof user.id === 'number' && 
        typeof user.name === 'string'
      );
      
      if (!isValid) {
        onError('Invalid file format: Users missing required fields (id, name)');
        return;
      }
      
      onSuccess(importedUsers);
    } catch (error) {
      onError(`Failed to parse JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  reader.onerror = () => {
    onError('Failed to read file');
  };
  
  reader.readAsText(file);
};

/**
 * Clear all whitelist data
 */
export const clearWhitelist = (): void => {
  if (!confirm('Are you sure you want to clear the entire whitelist? This action cannot be undone.')) {
    return;
  }
  
  localStorage.removeItem(WHITELISTED_RESULTS_STORAGE_KEY);
};

/**
 * Load whitelist from localStorage
 */
export const loadWhitelist = (): readonly AniListUser[] => {
  const whitelistedResultsFromStorage = localStorage.getItem(WHITELISTED_RESULTS_STORAGE_KEY);
  return whitelistedResultsFromStorage === null ? [] : JSON.parse(whitelistedResultsFromStorage);
};

/**
 * Save whitelist to localStorage
 */
export const saveWhitelist = (whitelistedUsers: readonly AniListUser[]): void => {
  localStorage.setItem(WHITELISTED_RESULTS_STORAGE_KEY, JSON.stringify(whitelistedUsers));
};

/**
 * Merge imported whitelist with existing whitelist (avoiding duplicates)
 */
export const mergeWhitelists = (
  existing: readonly AniListUser[],
  imported: readonly AniListUser[]
): readonly AniListUser[] => {
  const existingIds = new Set(existing.map(user => user.id));
  const uniqueImported = imported.filter(user => !existingIds.has(user.id));
  return [...existing, ...uniqueImported];
};

const isTimings = (value: unknown): value is Timings => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((timing) => typeof timing === 'number');
};

/**
 * Load timings from localStorage
 */
export const loadTimings = (): Timings | null => {
  const timingsFromStorage = localStorage.getItem(TIMINGS_STORAGE_KEY);

  if (timingsFromStorage === null) {
    return null;
  }

  try {
    const parsedTimings: unknown = JSON.parse(timingsFromStorage);
    return isTimings(parsedTimings) ? parsedTimings : null;
  } catch {
    return null;
  }
};

/**
 * Save timings to localStorage
 */
export const saveTimings = (timings: Timings): void => {
  localStorage.setItem(TIMINGS_STORAGE_KEY, JSON.stringify(timings));
};
