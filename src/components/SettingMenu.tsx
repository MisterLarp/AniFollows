import React, { useState } from "react";
import { Timings } from "../model/timings";
import { AniListUser } from "../model/anilist-user";
import { WhitelistManager } from "./WhitelistManager";

interface SettingMenuProps {
  setSettingState: (state: boolean) => void;
  currentTimings: Timings;
  setTimings: (timings: Timings) => void;
  whitelistedUsers: readonly AniListUser[];
  onWhitelistUpdate: (users: readonly AniListUser[]) => void;
}

export const SettingMenu = ({
  setSettingState,
  currentTimings,
  setTimings,
  whitelistedUsers,
  onWhitelistUpdate,
}: SettingMenuProps) => {
  const [timeBetweenScanPages, setTimeBetweenScanPages] = useState(currentTimings.timeBetweenScanPages);
  const [timeAfterScanBurst, setTimeAfterScanBurst] = useState(currentTimings.timeAfterScanBurst);
  const [timeBetweenActions, setTimeBetweenActions] = useState(currentTimings.timeBetweenActions);
  const [timeAfterFiveActions, setTimeAfterFiveActions] = useState(currentTimings.timeAfterFiveActions);

  const handleSave = (event: any) => {
    event.preventDefault();
    setTimings({
      timeBetweenScanPages,
      timeAfterScanBurst,
      timeBetweenActions,
      timeAfterFiveActions,
    });
    setSettingState(false);
  };

  const handleInputChange = (event: any, setter: (value: number) => void) => {
    const value = Number(event?.target?.value);
    setter(value);
  };

  return (
    <form onSubmit={handleSave}>
      <div className="backdrop">
        <div className="setting-menu">
          <div className="settings-module">
            <div className="module-header">
              <h3>Settings</h3>
            </div>

            <div className="settings-content">
              <div className="row">
                <label className="minimun-width">Time between scan pages (ms)</label>
                <input
                  type="number"
                  min={500}
                  max={999999}
                  value={timeBetweenScanPages}
                  onChange={(e) => handleInputChange(e, setTimeBetweenScanPages)}
                />
              </div>

              <div className="row">
                <label className="minimun-width">Time to wait after 6 scan pages (ms)</label>
                <input
                  type="number"
                  min={4000}
                  max={999999}
                  value={timeAfterScanBurst}
                  onChange={(e) => handleInputChange(e, setTimeAfterScanBurst)}
                />
              </div>

              <div className="row">
                <label className="minimun-width">Time between actions (follow/unfollow/like) (ms)</label>
                <input
                  type="number"
                  min={1000}
                  max={999999}
                  value={timeBetweenActions}
                  onChange={(e) => handleInputChange(e, setTimeBetweenActions)}
                />
              </div>

              <div className="row">
                <label className="minimun-width">Time to wait after 5 actions (ms)</label>
                <input
                  type="number"
                  min={70000}
                  max={999999}
                  value={timeAfterFiveActions}
                  onChange={(e) => handleInputChange(e, setTimeAfterFiveActions)}
                />
              </div>

              <div className="warning-container">
                <h3 className="warning"><b>WARNING:</b> Lowering these settings below default can lead to AniList rate-limiting or blocking you.</h3>
                <h3 className="warning">USE IT AT YOUR OWN RISK!!!!</h3>
              </div>
            </div>
          </div>

          <hr className="module-divider" />

          <div className="whitelist-module">
            <WhitelistManager
              whitelistedUsers={whitelistedUsers}
              onWhitelistUpdate={onWhitelistUpdate}
            />
          </div>

          <div className="btn-container">
            <button className="btn" type="button" onClick={() => setSettingState(false)}>Cancel</button>
            <button className="btn" type="submit">Save</button>
          </div>
        </div>
      </div>
    </form>
  );
};
