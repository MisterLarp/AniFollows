import React from 'react';

interface NotSearchingProps {
  onScan?: () => void;
  onEngage?: () => void;
  onNetworkFollow?: () => void;
  onTargetedEngagement?: () => void;
}

export const NotSearching = ({ onScan, onEngage, onNetworkFollow, onTargetedEngagement }: NotSearchingProps) => (
  <div className="not-searching-container">
    <div className="action-buttons">
      <button className="run-scan main-action" onClick={onScan}>
        Scan Followers
      </button>
      <button className="run-scan secondary-action" onClick={onEngage}>
        Engage Global Feed
      </button>
      <button className="run-scan secondary-action" onClick={onNetworkFollow}>
        Follow from Network
      </button>
      <button className="run-scan secondary-action" onClick={onTargetedEngagement} style={{ backgroundColor: '#007aff' }}>
        Targeted Engagement
      </button>
    </div>
  </div>
);
