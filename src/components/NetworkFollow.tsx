import React, { useState } from 'react';
import { NetworkFollowMode } from '../utils/anilist-api';

interface NetworkFollowProps {
  onStart: (targetUsername: string, mode: NetworkFollowMode) => void;
  onCancel: () => void;
}

export const NetworkFollow: React.FC<NetworkFollowProps> = ({ onStart, onCancel }) => {
  const [targetUsername, setTargetUsername] = useState('');
  const [mode, setMode] = useState<NetworkFollowMode>('followers');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let cleaned = targetUsername.trim();
    if (!cleaned) return;

    // If the user pasted a full URL (e.g. https://anilist.co/user/Msin/), extract just the username
    const match = cleaned.match(/(?:anilist\.co\/user\/|^)([a-zA-Z0-9_]+)(?:\/|$)/i);
    if (match && match[1]) {
      cleaned = match[1];
    } else {
      // If it wasn't a full URL, ensure absolutely no hidden characters (like zero-width spaces) are included
      cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '');
    }

    if (!cleaned) return;
    onStart(cleaned, mode);
  };

  return (
    <div className="network-follow-panel">
      <h3>Follow from Network</h3>
      <p>Target a specific user and follow their network in batches.</p>
      
      <form onSubmit={handleSubmit} className="network-follow-form">
        <div className="form-group">
          <label>Target Username</label>
          <input 
            type="text" 
            placeholder="e.g. MisterLarp"
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.currentTarget.value)}
            required
          />
        </div>
        
        <div className="form-group radio-group">
          <label className="radio-label">
            <input 
              type="radio" 
              name="mode" 
              value="followers" 
              checked={mode === 'followers'}
              onChange={() => setMode('followers')}
            />
            Their Followers
          </label>
          <label className="radio-label">
            <input 
              type="radio" 
              name="mode" 
              value="following" 
              checked={mode === 'following'}
              onChange={() => setMode('following')}
            />
            Their Following
          </label>
        </div>
        
        <div className="btn-container">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!targetUsername.trim()}>Start Following</button>
        </div>
      </form>
    </div>
  );
};
