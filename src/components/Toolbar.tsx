import React, { ChangeEvent, useState } from "react";
import { State } from "../model/state";
import { copyListToClipboard, exportToCSV, exportToJSON, getCurrentPageUsers, getUsersForDisplay } from "../utils/utils";
import { SettingMenu } from "./SettingMenu";
import { SettingIcon } from "./icons/SettingIcon";
import { Timings } from "../model/timings";
import { Logo } from "./icons/Logo";
import { AniListUser } from "../model/anilist-user";

interface ToolBarProps {
  isActiveProcess: boolean;
  state: State;
  setState: (state: State) => void;
  toggleAllUsers: (e: ChangeEvent<HTMLInputElement>) => void;
  toggleCurrentePageUsers: (e: ChangeEvent<HTMLInputElement>) => void;
  currentTimings: Timings;
  setTimings: (timings: Timings) => void;
  whitelistedUsers: readonly AniListUser[];
  onWhitelistUpdate: (users: readonly AniListUser[]) => void;
}

function getAutoUnfollowIds(state: State): ReadonlySet<number> | undefined {
  if (state.status !== "scanning") {
    return undefined;
  }
  return new Set(state.unfollowCandidates.map(c => c.user.id));
}

export const Toolbar = ({
  isActiveProcess,
  state,
  setState,
  toggleAllUsers,
  toggleCurrentePageUsers,
  currentTimings,
  setTimings,
  whitelistedUsers,
  onWhitelistUpdate,
}: ToolBarProps) => {

  const [setingMenu, setSettingMenu] = useState(false);

  let progressPercentage = 0;
  if (state.status === 'scanning' || state.status === 'unfollowing') {
    progressPercentage = state.percentage;
  } else if (state.status === 'engaging') {
    // We don't have a strict percentage for engaging, but we could use a marquee or pseudo-progress
    progressPercentage = 100;
  } else if (state.status === 'network_following') {
    // We don't have a strict percentage for network follow, but we can set 100 to show active state
    progressPercentage = 100;
  }

  return (
    <header className="app-header">
      {isActiveProcess && (
        <div
          className={`progressbar ${state.status === 'engaging' || state.status === 'network_following' ? 'indeterminate' : ''}`}
          style={{ '--progress-width': `${progressPercentage}%` } as React.CSSProperties}
        />
      )}
      <div className="app-header-content">
        <div
          className="logo"
          onClick={() => {
            if (isActiveProcess) {
              return;
            }
            switch (state.status) {
              case "initial":
                if (confirm("Go back to AniList?")) {
                  location.reload();
                }
                break;
              case "scanning":
              case "unfollowing":
              case "engaging":
              case "network_following":
                setState({ status: "initial" });
                break;
            }
          }}
        >
          <Logo />
          <div className="logo-text">
            <span>AniFollows</span>
            <span>Manager</span>
          </div>
        </div>
        
        {state.status === 'scanning' && (
          <>
            <button
              className="copy-list"
              onClick={() => {
                copyListToClipboard(
                  getUsersForDisplay(
                    state.results,
                    state.whitelistedResults,
                    state.currentTab,
                    state.searchTerm,
                    state.filter,
                    getAutoUnfollowIds(state),
                  ),
                );
              }}
              disabled={state.percentage < 100}
            >
              Copy List
            </button>
            <button
              className="copy-list"
              title="Export to JSON"
              onClick={() => {
                exportToJSON(getUsersForDisplay(state.results, state.whitelistedResults, state.currentTab, state.searchTerm, state.filter, getAutoUnfollowIds(state)));
              }}
              disabled={state.percentage < 100}
            >
              JSON
            </button>
            <button
              className="copy-list"
              title="Export to CSV"
              onClick={() => {
                exportToCSV(getUsersForDisplay(state.results, state.whitelistedResults, state.currentTab, state.searchTerm, state.filter, getAutoUnfollowIds(state)));
              }}
              disabled={state.percentage < 100}
            >
              CSV
            </button>
          </>
        )}

        {state.status === "initial" && <SettingIcon onClickLogo={() => { setSettingMenu(true); }} />}
        
        <input
          type="text"
          className="search-bar"
          placeholder="Search..."
          disabled={state.status === "initial" || state.status === "engaging" || state.status === "network_following"}
          value={state.status === "initial" || state.status === "engaging" || state.status === "network_following" ? "" : state.searchTerm}
          onChange={e => {
            if (state.status === "scanning" || state.status === "unfollowing") {
              setState({
                ...state,
                searchTerm: e.currentTarget.value,
              });
            }
          }}
        />
        
        {state.status === "scanning" && (
          <input
            title="Select all on this page"
            type="checkbox"
            disabled={state.percentage < 100}
            checked={
              (() => {
                const displayed = getUsersForDisplay(state.results, state.whitelistedResults, state.currentTab, state.searchTerm, state.filter, getAutoUnfollowIds(state));
                const pageUsers = getCurrentPageUsers(displayed, state.page);
                return pageUsers.length > 0 && pageUsers.every(u => state.selectedResults.some(s => s.id === u.id));
              })()
            }
            className="toggle-all-checkbox"
            onChange={toggleCurrentePageUsers}
          />
        )}
        
        {state.status === "scanning" && (
          <input
            title="Select all"
            type="checkbox"
            disabled={state.percentage < 100}
            checked={
              state.selectedResults.length > 0 &&
              state.selectedResults.length ===
              getUsersForDisplay(
                state.results,
                state.whitelistedResults,
                state.currentTab,
                state.searchTerm,
                state.filter,
                getAutoUnfollowIds(state),
              ).length
            }
            className="toggle-all-checkbox"
            onChange={toggleAllUsers}
          />
        )}
      </div>
      
      {setingMenu &&
        <SettingMenu
          setSettingState={setSettingMenu}
          currentTimings={currentTimings}
          setTimings={setTimings}
          whitelistedUsers={whitelistedUsers}
          onWhitelistUpdate={onWhitelistUpdate}
        />
      }
    </header>
  );
};
