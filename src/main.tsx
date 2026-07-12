import React, { ChangeEvent, useEffect, useState } from "react";
import { render } from "react-dom";
import "./styles.scss";

import { AniListUser } from "./model/anilist-user";
import { Toast } from "./components/Toast";
import { UserCheckIcon } from "./components/icons/UserCheckIcon";
import { UserUncheckIcon } from "./components/icons/UserUncheckIcon";
import {
  DEFAULT_TIME_BETWEEN_SCAN_PAGES,
  DEFAULT_TIME_AFTER_SCAN_BURST,
  DEFAULT_TIME_BETWEEN_ACTIONS,
  DEFAULT_TIME_AFTER_FIVE_ACTIONS,
  ROOT_ELEMENT_ID,
} from "./constants/constants";
import { getUsersForDisplay, getCurrentPageUsers } from "./utils/utils";
import { NotSearching } from "./components/NotSearching";
import { State } from "./model/state";
import { Searching } from "./components/Searching";
import { Toolbar } from "./components/Toolbar";
import { Unfollowing } from "./components/Unfollowing";
import { AuthScreen } from "./components/AuthScreen";
import { NetworkFollow } from "./components/NetworkFollow";
import { Timings } from "./model/timings";
import { loadWhitelist, saveWhitelist, loadTimings, saveTimings } from "./utils/whitelist-manager";
import { getRecentFollows } from "./utils/follow-history-manager";
import { getUnfollowCandidates } from "./utils/auto-unfollow-logic";
import { recordScriptRun, getSessionStats } from "./utils/session-guard";
import { getStoredToken, loadOrFetchViewer, getStoredViewer } from "./utils/anilist-auth";
import { executeBatchedActions, fetchAllFollowers, fetchAllFollowing, fetchUserByName, mergeFollowLists, runEngagementSession, runNetworkFollowSession, sleep } from "./utils/anilist-api";

let scanningPaused = false;

function pauseScan() {
  scanningPaused = !scanningPaused;
}

function recalculateUnfollowCandidates(results: readonly AniListUser[]): ReturnType<typeof getUnfollowCandidates> {
  const recentFollows = getRecentFollows(96);
  return getUnfollowCandidates(results, recentFollows);
}

function App() {
  const [token, setTokenState] = useState<string | null>(getStoredToken());
  const [state, setState] = useState<State>({ status: "initial" });
  const [toast, setToast] = useState<{ readonly show: false } | { readonly show: true; readonly text: string }>({ show: false });

  const [timings, setTimings] = useState<Timings>(() => {
    const storedTimings = loadTimings();
    return storedTimings ?? {
      timeBetweenScanPages: DEFAULT_TIME_BETWEEN_SCAN_PAGES,
      timeAfterScanBurst: DEFAULT_TIME_AFTER_SCAN_BURST,
      timeBetweenActions: DEFAULT_TIME_BETWEEN_ACTIONS,
      timeAfterFiveActions: DEFAULT_TIME_AFTER_FIVE_ACTIONS,
    };
  });

  useEffect(() => {
    saveTimings(timings);
  }, [timings]);

  // Load viewer on start if token exists
  useEffect(() => {
    if (token) {
      loadOrFetchViewer(token).catch(e => {
        console.error("Failed to load viewer:", e);
        setToast({ show: true, text: "Failed to load AniList profile. Token might be invalid." });
      });
    }
  }, [token]);


  let isActiveProcess = state.status !== "initial";
  if (state.status === "scanning" || state.status === "unfollowing") {
    isActiveProcess = state.percentage < 100;
  }

  const handleTokenSubmitted = (newToken: string) => {
    setTokenState(newToken);
  };

  const onScan = async () => {
    if (state.status !== "initial" || !token) return;

    const viewer = getStoredViewer();
    if (!viewer) {
      setToast({ show: true, text: "Loading viewer profile..." });
      return;
    }

    const guardResult = recordScriptRun();
    if (!guardResult.ok) {
      setToast({ show: true, text: guardResult.warning! });
      if (guardResult.extraDelayMs > 0) {
        await sleep(guardResult.extraDelayMs);
      }
    } else if (guardResult.warning) {
      setToast({ show: true, text: guardResult.warning });
      await sleep(3000);
    }

    const stats = getSessionStats();
    if (stats.runCount > 1) {
      setToast({
        show: true,
        text: `📊 Today: ${stats.runCount} runs · ${stats.scanPages} pages · ${stats.mutations} mutations`,
      });
      await sleep(2500);
    }

    const whitelistedResults = loadWhitelist();
    setState({
      status: "scanning",
      page: 1,
      searchTerm: "",
      currentTab: "non_whitelisted",
      percentage: 0,
      phase: "Starting scan...",
      results: [],
      selectedResults: [],
      whitelistedResults,
      filter: {
        showNonFollowers: true,
        showFollowers: false,
        showAutoUnfollowOnly: false,
      },
      unfollowCandidates: [],
      followHistoryVersion: 0,
    });
  };

  // The actual scanning effect
  useEffect(() => {
    if (state.status !== "scanning" || !token) return;
    if (state.percentage > 0) return; // Only start if we're at 0%

    let cancelled = false;

    const runScan = async () => {
      const viewer = getStoredViewer();
      if (!viewer) return;

      try {
        setToast({ show: true, text: "Fetching Following list..." });
        const following = await fetchAllFollowing(viewer.id, token, {
          betweenPages: timings.timeBetweenScanPages,
          afterBurst: timings.timeAfterScanBurst
        }, (progress) => {
          if (cancelled) return;
          setState(prev => prev.status === 'scanning' ? { ...prev, phase: progress.phase } : prev);
        });

        if (cancelled) return;

        setToast({ show: true, text: "Fetching Followers list..." });
        const followers = await fetchAllFollowers(viewer.id, token, {
          betweenPages: timings.timeBetweenScanPages,
          afterBurst: timings.timeAfterScanBurst
        }, (progress) => {
          if (cancelled) return;
          setState(prev => prev.status === 'scanning' ? { ...prev, phase: progress.phase } : prev);
        });

        if (cancelled) return;

        setToast({ show: true, text: "Merging lists..." });
        const merged = mergeFollowLists(following, followers);
        const candidates = recalculateUnfollowCandidates(merged);

        setState(prev => {
          if (prev.status !== "scanning") return prev;
          return {
            ...prev,
            percentage: 100,
            phase: "Scan complete.",
            results: merged,
            unfollowCandidates: candidates
          };
        });
        setToast({ show: false });
      } catch (err) {
        console.error(err);
        setToast({ show: true, text: `Scan failed: ${err instanceof Error ? err.message : String(err)}` });
      }
    };

    runScan();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);


  // Effect for unfollowing
  useEffect(() => {
    if (state.status !== "unfollowing" || !token) return;
    if (state.selectedResults.length === 0 || state.percentage === 100) return;

    let cancelled = false;

    const runUnfollow = async () => {
      await executeBatchedActions(
        state.selectedResults,
        'unfollow',
        token,
        {
          betweenActions: timings.timeBetweenActions,
          afterFiveBatch: timings.timeAfterFiveActions
        },
        (result, completed, total) => {
          if (cancelled) return;
          const user = state.selectedResults.find(u => u.id === result.userId);
          if (!user) return;
          
          setState(prev => {
            if (prev.status !== "unfollowing") return prev;
            return {
              ...prev,
              percentage: Math.round((completed / total) * 100),
              unfollowLog: [
                ...prev.unfollowLog,
                { user, unfollowedSuccessfully: result.success, error: result.error }
              ]
            };
          });
        },
        () => cancelled
      );
    };

    runUnfollow();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Effect for engaging global feed
  useEffect(() => {
    if (state.status !== "engaging" || !token) return;
    if (state.phase === "Engagement session complete.") return; // already done

    let cancelled = false;

    const runEngage = async () => {
      const viewer = getStoredViewer();
      if (!viewer) return;

      try {
        const following = await fetchAllFollowing(viewer.id, token, undefined, () => {
          if (cancelled) return;
          setState(prev => prev.status === 'engaging' ? { ...prev, phase: "Loading following list to prevent duplicates..." } : prev);
        });

        if (cancelled) return;

        const alreadyFollowingIds = new Set(following.map(u => u.id));

        await runEngagementSession(
          token,
          alreadyFollowingIds,
          (progress) => {
            if (cancelled) return;
            setState(prev => prev.status === 'engaging' ? {
              ...prev,
              phase: progress.phase,
              liked: progress.liked,
              followed: progress.followed,
              skipped: progress.skipped
            } : prev);
          },
          () => cancelled
        );
      } catch (err) {
        setToast({ show: true, text: `Error: ${err instanceof Error ? err.message : String(err)}` });
      }
    };

    runEngage();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Effect for network follow
  useEffect(() => {
    if (state.status !== "network_following" || !token) return;
    if (state.phase === "Network follow session complete.") return;

    let cancelled = false;

    const runNetwork = async () => {
      const viewer = getStoredViewer();
      if (!viewer) return;

      try {
        setState(prev => prev.status === 'network_following' ? { ...prev, phase: "Looking up target user..." } : prev);
        const target = await fetchUserByName(state.targetUsername, token);

        if (cancelled) return;

        setState(prev => prev.status === 'network_following' ? { ...prev, phase: "Loading your following list to prevent duplicates..." } : prev);
        const following = await fetchAllFollowing(viewer.id, token);
        const alreadyFollowingIds = new Set(following.map(u => u.id));
        const whitelistedIds = new Set(loadWhitelist().map(u => u.id));

        if (cancelled) return;

        await runNetworkFollowSession(
          target.id,
          state.mode,
          token,
          alreadyFollowingIds,
          whitelistedIds,
          50, // max to follow per session
          {
            betweenActions: timings.timeBetweenActions,
            afterFiveBatch: timings.timeAfterFiveActions
          },
          (progress) => {
            if (cancelled) return;
            setState(prev => prev.status === 'network_following' ? {
              ...prev,
              phase: progress.phase,
              followed: progress.followed,
              skipped: progress.skipped,
              total: progress.total
            } : prev);
          },
          () => cancelled
        );
      } catch (err) {
        setToast({ show: true, text: `Error: ${err instanceof Error ? err.message : String(err)}` });
      }
    };

    runNetwork();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);


  if (!token) {
    return <AuthScreen onTokenSubmitted={handleTokenSubmitted} />;
  }

  return (
    <>
      <Toolbar
        isActiveProcess={isActiveProcess}
        state={state}
        setState={setState}
        toggleAllUsers={(e: ChangeEvent<HTMLInputElement>) => {
          if (state.status === "scanning") {
            const displayed = getUsersForDisplay(
              state.results,
              state.whitelistedResults,
              state.currentTab,
              state.searchTerm,
              state.filter,
              new Set(state.unfollowCandidates.map(c => c.user.id)),
            );
            if (e.currentTarget.checked) {
              const currentIds = new Set(state.selectedResults.map(u => u.id));
              const toAdd = displayed.filter(u => !currentIds.has(u.id));
              setState({
                ...state,
                selectedResults: [...state.selectedResults, ...toAdd],
              });
            } else {
              const displayedIds = new Set(displayed.map(u => u.id));
              setState({
                ...state,
                selectedResults: state.selectedResults.filter(u => !displayedIds.has(u.id)),
              });
            }
          }
        }}
        toggleCurrentePageUsers={(e: ChangeEvent<HTMLInputElement>) => {
          if (state.status === "scanning") {
            const pageUsers = getCurrentPageUsers(
              getUsersForDisplay(
                state.results,
                state.whitelistedResults,
                state.currentTab,
                state.searchTerm,
                state.filter,
                new Set(state.unfollowCandidates.map(c => c.user.id)),
              ),
              state.page,
            );
            if (e.currentTarget.checked) {
              const currentIds = new Set(state.selectedResults.map(u => u.id));
              const toAdd = pageUsers.filter(u => !currentIds.has(u.id));
              setState({
                ...state,
                selectedResults: [...state.selectedResults, ...toAdd],
              });
            } else {
              const pageUserIds = new Set(pageUsers.map(u => u.id));
              setState({
                ...state,
                selectedResults: state.selectedResults.filter(u => !pageUserIds.has(u.id)),
              });
            }
          }
        }}
        currentTimings={timings}
        setTimings={setTimings}
        whitelistedUsers={state.status === 'scanning' ? state.whitelistedResults : loadWhitelist()}
        onWhitelistUpdate={(updatedWhitelist) => {
          saveWhitelist(updatedWhitelist);
          if (state.status === "scanning") {
            setState({ ...state, whitelistedResults: updatedWhitelist });
          }
        }}
      />

      <main className="app-main">
        {state.status === "initial" && (
          <NotSearching 
            onScan={onScan} 
            onEngage={() => setState({ status: 'engaging', phase: 'Starting engagement...', liked: 0, followed: 0, skipped: 0 })}
            onNetworkFollow={() => setState({ status: 'network_following', targetUsername: '', mode: 'followers', phase: '', followed: 0, skipped: 0, total: 0 })}
          />
        )}
        
        {state.status === "network_following" && state.targetUsername === '' && (
          <NetworkFollow 
            onCancel={() => setState({ status: "initial" })}
            onStart={(target, mode) => setState({
              status: "network_following",
              targetUsername: target,
              mode: mode,
              phase: "Initializing...",
              followed: 0,
              skipped: 0,
              total: 0
            })}
          />
        )}

        {state.status === "network_following" && state.targetUsername !== '' && (
          <div className="network-follow-status panel">
            <h2>Following {state.targetUsername}'s {state.mode}</h2>
            <div className="status-phase">{state.phase}</div>
            <div className="status-stats">
              <div><strong>{state.followed}</strong> Followed</div>
              <div><strong>{state.skipped}</strong> Skipped</div>
            </div>
          </div>
        )}

        {state.status === "engaging" && (
          <div className="engage-status panel">
            <h2>Engaging Global Feed</h2>
            <div className="status-phase">{state.phase}</div>
            <div className="status-stats">
              <div><strong>{state.liked}</strong> Liked</div>
              <div><strong>{state.followed}</strong> Followed</div>
              <div><strong>{state.skipped}</strong> Skipped</div>
            </div>
          </div>
        )}

        <Searching
          state={state}
          setState={setState}
          scanningPaused={scanningPaused}
          pauseScan={pauseScan}
          handleScanFilter={(e: ChangeEvent<HTMLInputElement>) => {
            if (state.status !== "scanning") return;
            if (state.selectedResults.length > 0) {
              if (!confirm("Changing filter options will clear selected users")) {
                setState({ ...state });
                return;
              }
            }
            setState({
              ...state,
              selectedResults: [],
              filter: {
                ...state.filter,
                [e.currentTarget.name]: e.currentTarget.checked,
              },
            });
          }}
          toggleUser={(newStatus: boolean, user: AniListUser) => {
            if (state.status !== "scanning") return;
            if (newStatus) {
              setState({ ...state, selectedResults: [...state.selectedResults, user] });
            } else {
              setState({ ...state, selectedResults: state.selectedResults.filter(r => r.id !== user.id) });
            }
          }}
          UserCheckIcon={UserCheckIcon}
          UserUncheckIcon={UserUncheckIcon}
          onTrackFollow={() => {}}
        />

        <Unfollowing
          state={state}
          handleUnfollowFilter={(e: ChangeEvent<HTMLInputElement>) => {
            if (state.status !== "unfollowing") return;
            setState({
              ...state,
              filter: { ...state.filter, [e.currentTarget.name]: e.currentTarget.checked },
            });
          }}
        />
      </main>
      
      {toast.show && <Toast message={toast.text} />}
    </>
  );
}

// Ensure the root container is present
let container = document.getElementById(ROOT_ELEMENT_ID);
if (!container) {
  container = document.createElement("div");
  container.id = ROOT_ELEMENT_ID;
  document.body.appendChild(container);
  
  // Basic reset to ensure it overlays cleanly
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.zIndex = "999999";
  container.style.pointerEvents = "none"; // allow clicks to pass through empty space
}

render(<App />, container);
