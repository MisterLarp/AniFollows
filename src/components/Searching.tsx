import React from "react";
import { assertUnreachable, getCurrentPageUsers, getMaxPage, getUsersForDisplay } from "../utils/utils";
import { State } from "../model/state";
import { AniListUser } from "../model/anilist-user";
import { WHITELISTED_RESULTS_STORAGE_KEY } from "../constants/constants";
import { addTestFollowEntry, cleanupOldFollows, exportFollowHistory, importFollowHistory } from "../utils/follow-history-manager";
import { getUnfollowReasonBadge } from "../utils/auto-unfollow-logic";
import { FOLLOW_HISTORY_STORAGE_KEY, FollowHistoryEntry } from "../model/follow-history";

export interface SearchingProps {
  state: State;
  setState: (state: State) => void;
  scanningPaused: boolean;
  pauseScan: () => void;
  handleScanFilter: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleUser: (checked: boolean, user: AniListUser) => void;
  UserCheckIcon: React.FC;
  UserUncheckIcon: React.FC;
  onTrackFollow: (user: AniListUser) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

let importFileInput: HTMLInputElement | null = null;

function formatFollowAge(entry: FollowHistoryEntry): string {
  const hours = (Date.now() - entry.followedAt) / (1000 * 60 * 60);
  const estimated = entry.followDateSource === "estimated";
  const prefix = estimated ? "~" : "";
  if (hours < 1) {
    return `${prefix}<1h`;
  }
  if (hours < 48) {
    return `${prefix}${Math.round(hours)}h`;
  }
  return `${prefix}${Math.round(hours / 24)}d`;
}

export const Searching = ({
  state,
  setState,
  scanningPaused,
  pauseScan,
  handleScanFilter,
  toggleUser,
  UserCheckIcon,
  UserUncheckIcon,
  onTrackFollow,
  onSelectAll,
  onDeselectAll,
}: SearchingProps) => {
  if (state.status !== "scanning") {
    return null;
  }

  const autoUnfollowIds = new Set(state.unfollowCandidates.map(c => c.user.id));
  const usersForDisplay = getUsersForDisplay(
    state.results,
    state.whitelistedResults,
    state.currentTab,
    state.searchTerm,
    state.filter,
    autoUnfollowIds,
  );

  const bumpFollowHistory = () => {
    setState({
      ...state,
      followHistoryVersion: state.followHistoryVersion + 1,
    });
  };
  let currentLetter = "";

  const onNewLetter = (firstLetter: string) => {
    currentLetter = firstLetter;
    return <div className="alphabet-character">{currentLetter}</div>;
  };

  // Get follow entry without importing the old sync file directly to avoid circulars,
  // we just parse the state's follow history since the caller passed a version bump 
  // we assume we can read local storage here.
  const getFollowEntry = (userId: number): FollowHistoryEntry | null => {
    const raw = localStorage.getItem(FOLLOW_HISTORY_STORAGE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return data.entries.find((e: any) => e.userId === userId) || null;
    } catch {
      return null;
    }
  };

  return (
    <section className="flex">
      <aside className="app-sidebar">
        <div className="sidebar-content">
          <menu className="sidebar-filters-grid">
            <p>Filter</p>
            <label className="badge m-small">
              <input
                type="checkbox"
                name="showNonFollowers"
                checked={state.filter.showNonFollowers}
                onChange={handleScanFilter}
              />
              &nbsp;Non-Followers
            </label>
            <label className="badge m-small">
              <input
                type="checkbox"
                name="showFollowers"
                checked={state.filter.showFollowers}
                onChange={handleScanFilter}
              />
              &nbsp;Followers
            </label>
          </menu>

          <div className="auto-unfollow-section">
            <div style={{
              border: "none",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              margin: "8px 0",
            }} />
            <label className="badge m-small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={state.filter.showAutoUnfollowOnly}
                onChange={(e) => {
                  if (state.status !== "scanning") return;
                  if (state.selectedResults.length > 0 && !confirm("Changing filter options will clear selected users")) {
                    return;
                  }
                  setState({
                    ...state,
                    selectedResults: [],
                    filter: { ...state.filter, showAutoUnfollowOnly: e.currentTarget.checked },
                  });
                }}
              />
              🔴 Auto-Unfollow Only
            </label>
          </div>

          <div className="sidebar-buttons-grid">
            <button
              className="button-secondary"
              onClick={onSelectAll}
              title="Select all currently displayed users"
            >
              ✅ Select All
            </button>
            <button
              className="button-secondary"
              onClick={onDeselectAll}
              title="Deselect all users"
            >
              ☐ Deselect All
            </button>
            <button
              className="button-secondary danger-text"
              onClick={() => {
                const candidateUsers = state.unfollowCandidates.map(c => c.user);
                const currentIds = new Set(state.selectedResults.map(u => u.id));
                const toAdd = candidateUsers.filter(u => !currentIds.has(u.id));
                setState({ ...state, selectedResults: [...state.selectedResults, ...toAdd] });
              }}
              disabled={state.unfollowCandidates.length === 0}
            >
              ⚡ Select Auto-Unfollow
            </button>
            <button
              className="button-secondary danger-text"
              onClick={() => setState({ ...state, selectedResults: [] })}
            >
              Clear
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                if (usersForDisplay.length === 0) return;
                const testUser = usersForDisplay[0];
                addTestFollowEntry(testUser.id, testUser.name, 25);
                alert(`Test: ${testUser.name} marked as followed 25h ago`);
                bumpFollowHistory();
              }}
            >
              🧪 Test 25h
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                if (usersForDisplay.length === 0) return;
                const testUser = usersForDisplay[0];
                addTestFollowEntry(testUser.id, testUser.name, 50);
                alert(`Test: ${testUser.name} marked as followed 50h ago`);
                bumpFollowHistory();
              }}
            >
              🧪 Test 50h
            </button>

            <div style={{
              border: "none",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              margin: "8px 0"
            }} />
            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>
              Follow History
            </p>
            <button
              className="button-secondary"
              onClick={() => {
                exportFollowHistory();
              }}
              title="Export follow history to a JSON file for backup"
            >
              📥 Export History
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                importFileInput?.click();
              }}
              title="Import follow history from a backup JSON file"
            >
              📤 Import History
            </button>
            <input
              ref={(el) => { importFileInput = el; }}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                importFollowHistory(
                  file,
                  (count) => {
                    alert(`Imported ${count} entries from backup`);
                    bumpFollowHistory();
                  },
                  (error) => {
                    alert(`Import failed: ${error}`);
                  }
                );
                e.currentTarget.value = "";
              }}
            />
            <button
              className="button-secondary danger-text"
              onClick={() => {
                const confirmed = confirm(
                  '⚠️ Clear Follow History?\n\n' +
                  'This will PERMANENTLY DELETE all tracked follow dates.\n\n' +
                  'Are you sure you want to proceed?'
                );
                if (!confirmed) return;
                localStorage.removeItem(FOLLOW_HISTORY_STORAGE_KEY);
                cleanupOldFollows(0);
                alert('Follow history cleared');
                bumpFollowHistory();
              }}
            >
              🗑️ Clear History
            </button>
          </div>
          <div className="sidebar-stats">
            <p>Displayed: {usersForDisplay.length}</p>
            <p>Total Scanned: {state.results.length}</p>
            <p className="whitelist-counter">
              <span className="whitelist-badge">★</span> Whitelisted: {state.whitelistedResults.length}
            </p>
            <p className="unfollow-counter">
              <span className="unfollow-badge">⚠️</span> Auto-Unfollow: {state.unfollowCandidates.length}
            </p>
            {state.unfollowCandidates.length > 0 && (
              <div className="unfollow-stats">
                <span className="stat-title">Candidates by rule</span>
                <div className="unfollow-stats-grid">
                  <span>📵 24h: {state.unfollowCandidates.filter(c => c.reason === 'TIMEOUT_24H').length}</span>
                  <span>⏰ 48h: {state.unfollowCandidates.filter(c => c.reason === 'TIMEOUT_48H').length}</span>
                </div>
              </div>
            )}
          </div>

          {state.percentage === 100 && (
            <div className="sidebar-summary">
              <h4>Scan Summary</h4>
              <div className="summary-grid">
                <div className="summary-item">
                  <span>Non-Followers</span>
                  <strong>{state.results.filter(u => !u.isFollower).length}</strong>
                </div>
              </div>
            </div>
          )}
          <div className="sidebar-footer-controls">
            <button
              className="button-control button-pause"
              onClick={pauseScan}
            >
              {scanningPaused ? "Resume" : "Pause"}
            </button>
            <div className="sidebar-pagination">
              <div className="pagination-controls">
                <a
                  onClick={() => {
                    if (state.page - 1 > 0) {
                      setState({
                        ...state,
                        page: state.page - 1,
                      });
                    }
                  }}
                >
                  ❮
                </a>
                <span>
                  {state.page}/{getMaxPage(usersForDisplay)}
                </span>
                <a
                  onClick={() => {
                    if (state.page < getMaxPage(usersForDisplay)) {
                      setState({
                        ...state,
                        page: state.page + 1,
                      });
                    }
                  }}
                >
                  ❯
                </a>
              </div>
            </div>
          </div>
        </div>
        <button
          className="unfollow"
          onClick={() => {
            if (!confirm("Are you sure?")) {
              return;
            }
            if (state.selectedResults.length === 0) {
              alert("Must select at least a single user to unfollow");
              return;
            }
            setState({
              ...state,
              status: "unfollowing",
              percentage: 0,
              unfollowLog: [],
              filter: {
                showSucceeded: true,
                showFailed: true,
              },
            });
          }}
        >
          UNFOLLOW ({state.selectedResults.length})
        </button>
      </aside>
      <article className="results-container">
        {state.phase && (
          <div className="scan-phase-indicator" style={{ padding: '10px 20px', background: 'rgba(2, 169, 255, 0.1)', color: '#02a9ff', fontWeight: 600, borderBottom: '1px solid rgba(2, 169, 255, 0.2)' }}>
            {state.phase} {state.percentage < 100 && <span className="loading-dots">...</span>}
          </div>
        )}
        <nav className="tabs-container">
          <div
            className={`tab ${state.currentTab === "non_whitelisted" ? "tab-active" : ""}`}
            onClick={() => {
              if (state.currentTab === "non_whitelisted") return;
              setState({
                ...state,
                currentTab: "non_whitelisted",
                selectedResults: [],
              });
            }}
          >
            Non-Whitelisted
          </div>
          <div
            className={`tab ${state.currentTab === "whitelisted" ? "tab-active" : ""}`}
            onClick={() => {
              if (state.currentTab === "whitelisted") return;
              setState({
                ...state,
                currentTab: "whitelisted",
                selectedResults: [],
              });
            }}
          >
            Whitelisted
          </div>
        </nav>
        {getCurrentPageUsers(usersForDisplay, state.page).map(user => {
          const firstLetter = user.name.substring(0, 1).toUpperCase();
          const candidate = state.unfollowCandidates.find(c => c.user.id === user.id);
          const isUnfollowCandidate = candidate != null;
          const reasonBadge = candidate ? getUnfollowReasonBadge(candidate.reason) : null;
          const followEntry = getFollowEntry(user.id);
          return (
            <React.Fragment key={user.id}>
              {firstLetter !== currentLetter && onNewLetter(firstLetter)}
              <label className={`result-item ${isUnfollowCandidate ? 'unfollow-pulse' : ''}`}>
                <div className="flex grow align-center">
                  <div
                    className={`avatar-container ${isUnfollowCandidate ? 'avatar-unfollow-pulse' : ''}`}
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      let whitelistedResults: readonly AniListUser[] = [];
                      switch (state.currentTab) {
                        case "non_whitelisted":
                          whitelistedResults = [...state.whitelistedResults, user];
                          break;
                        case "whitelisted":
                          whitelistedResults = state.whitelistedResults.filter(
                            result => result.id !== user.id,
                          );
                          break;
                        default:
                          assertUnreachable(state.currentTab);
                      }
                      localStorage.setItem(
                        WHITELISTED_RESULTS_STORAGE_KEY,
                        JSON.stringify(whitelistedResults),
                      );
                      setState({ ...state, whitelistedResults });
                    }}
                  >
                    <img
                      className="avatar"
                      alt={user.name}
                      src={user.avatar.medium}
                    />
                    <div className="avatar-preview">
                      <img src={user.avatar.large} alt={user.name} />
                    </div>
                    <span className="avatar-icon-overlay-container">
                      {state.currentTab === "non_whitelisted" ? (
                        <UserCheckIcon />
                      ) : (
                        <UserUncheckIcon />
                      )}
                    </span>
                  </div>
                  <div className="flex column m-medium">
                    <a
                      className="fs-xlarge"
                      target="_blank"
                      href={user.siteUrl}
                      rel="noreferrer"
                    >
                      {user.name}
                    </a>
                    {followEntry && (
                      <div className="flex column gap-micro">
                        <span className="follow-tracked-label" title={`Source: ${followEntry.followDateSource ?? "unknown"}`}>
                          Followed {formatFollowAge(followEntry)} ago
                        </span>
                        {followEntry.hasPostedSinceFollow && (
                          <span className="follow-tracked-label" style={{ color: '#ff9f0a' }} title="User has posted an activity on AniList since you followed them">
                            📢 Posted
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {reasonBadge && (
                    <div className="unfollow-reason-badge" title={`Auto-unfollow: ${reasonBadge.text}`}>
                      {reasonBadge.emoji} {reasonBadge.text}
                    </div>
                  )}
                </div>
                <div className="flex align-center gap-small">
                  <button
                    type="button"
                    className={`track-follow-button ${followEntry ? "tracked" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTrackFollow(user);
                    }}
                    title={followEntry
                      ? "Reset follow time to now (restarts 24h/48h timers — confirm)"
                      : "Track as followed now"}
                  >
                    {followEntry ? "✓" : "+"}
                  </button>
                  <button
                    className={`whitelist-star-button ${state.currentTab === "whitelisted" ? "active" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      let whitelistedResults: readonly AniListUser[] = [];
                      if (state.whitelistedResults.some(r => r.id === user.id)) {
                        whitelistedResults = state.whitelistedResults.filter(r => r.id !== user.id);
                      } else {
                        whitelistedResults = [...state.whitelistedResults, user];
                      }
                      localStorage.setItem(
                        WHITELISTED_RESULTS_STORAGE_KEY,
                        JSON.stringify(whitelistedResults),
                      );
                      setState({ ...state, whitelistedResults });
                    }}
                    title={state.whitelistedResults.some(r => r.id === user.id) ? "Remove from whitelist" : "Add to whitelist"}
                  >
                    ★
                  </button>
                  <input
                    className="account-checkbox"
                    type="checkbox"
                    checked={state.selectedResults.indexOf(user) !== -1}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => toggleUser(e.currentTarget.checked, user)}
                  />
                </div>
              </label>
            </React.Fragment>
          );
        })}
      </article>
    </section>
  );
};
