import React from 'react';
import { useState } from 'preact/hooks';
import type { TargetedEngagementState } from '../model/state';

function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  return `${secs}s`;
}

interface TargetedEngagementProps {
  state: TargetedEngagementState;
  onStart: (
    targetGroup: TargetedEngagementState['targetGroup'],
    config: TargetedEngagementState['config']
  ) => void;
  onCancel: () => void;
}

export const TargetedEngagement = ({ state, onStart, onCancel }: TargetedEngagementProps) => {
  const [targetGroup, setTargetGroup] = useState<TargetedEngagementState['targetGroup']>('followers');
  const [maxUsers, setMaxUsers] = useState<number>(50);
  const [activitiesPerUser, setActivitiesPerUser] = useState<number>(2);
  const [includeMessages, setIncludeMessages] = useState<boolean>(false);
  const [reciprocalHours, setReciprocalHours] = useState<number>(24);
  const [reciprocalMinLikes, setReciprocalMinLikes] = useState<number>(2);

  const isConfiguring = !state.phase;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    onStart(targetGroup, {
      maxUsers,
      activitiesPerUser,
      includeMessages,
      reciprocalHours,
      reciprocalMinLikes
    });
  };

  if (!isConfiguring) {
    return (
      <div className="network-follow-form" style={{ maxWidth: '600px' }}>
        <h2>Targeted Engagement Running</h2>
        <div className="status-phase">{state.phase}</div>
        
        <div className="unfollow-stats" style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.2)' }}>
          <div className="unfollow-stats-grid" style={{ gap: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <span className="stat-title">Users Processed</span>
              <strong style={{ fontSize: '1.4rem' }}>{state.progress.processedUsers} / {state.progress.totalUsers || '?'}</strong>
            </div>
            <div>
              <span className="stat-title">Activities Liked</span>
              <strong style={{ fontSize: '1.4rem', color: '#34c759' }}>{state.progress.likedActivities}</strong>
            </div>
          </div>
        </div>

        <div className="form-actions" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
          {state.cooldownRemainingMs != null && state.cooldownRemainingMs > 0 && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(255,159,10,0.12)',
              border: '1px solid rgba(255,159,10,0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              color: '#ff9f0a'
            }}>
              ⏳ <strong>Next batch in: {formatCooldown(state.cooldownRemainingMs)}</strong>
            </div>
          )}
          {state.phase !== 'Targeted engagement session complete.' ? (
            <button type="button" className="btn btn-primary" style={{ backgroundColor: '#ff3b30' }} onClick={onCancel}>
              Stop Session
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onCancel}>
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="network-follow-form" style={{ maxWidth: '600px' }}>
      <h2>Targeted Engagement</h2>
      <p style={{ color: 'hsla(0,0%,100%,0.6)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
        Automatically like recent activities of users based on specific criteria.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="te-target-group">Target Group</label>
          <select 
            id="te-target-group" 
            value={targetGroup} 
            onChange={(e) => setTargetGroup((e.target as HTMLSelectElement).value as any)}
          >
            <option value="followers">All Followers</option>
            <option value="following">All Following</option>
            <option value="mutuals">Mutuals (Followers who follow you back)</option>
            <option value="non_mutuals">Non-Mutuals (Following who don't follow back)</option>
            <option value="reciprocal">Reciprocal (Liked your activities recently)</option>
          </select>
        </div>

        {targetGroup === 'reciprocal' && (
          <div style={{ background: 'hsla(0,0%,100%,0.04)', padding: '1rem', borderRadius: '8px', marginBottom: '1.2rem', border: '1px solid hsla(0,0%,100%,0.08)' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem' }}>Reciprocal Engine Settings</h4>
            
            <div className="form-group" style={{ marginBottom: '0.8rem' }}>
              <label htmlFor="te-recip-hours">Lookback Timeframe (Hours)</label>
              <input 
                id="te-recip-hours" 
                type="number" 
                min="2" 
                max="24" 
                value={reciprocalHours}
                onChange={(e) => setReciprocalHours(parseInt((e.target as HTMLInputElement).value, 10))}
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="te-recip-likes">Minimum Likes Received Trigger</label>
              <input 
                id="te-recip-likes" 
                type="number" 
                min="1" 
                value={reciprocalMinLikes}
                onChange={(e) => setReciprocalMinLikes(parseInt((e.target as HTMLInputElement).value, 10))}
              />
            </div>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="te-max-users">Max Users to Process</label>
          <input 
            id="te-max-users" 
            type="number" 
            min="1" 
            value={maxUsers}
            onChange={(e) => setMaxUsers(parseInt((e.target as HTMLInputElement).value, 10))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="te-activities-per">Activities to Like per User</label>
          <input 
            id="te-activities-per" 
            type="number" 
            min="1" 
            max="10"
            value={activitiesPerUser}
            onChange={(e) => setActivitiesPerUser(parseInt((e.target as HTMLInputElement).value, 10))}
          />
        </div>

        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <input 
            id="te-include-msgs" 
            type="checkbox" 
            checked={includeMessages}
            onChange={(e) => setIncludeMessages((e.target as HTMLInputElement).checked)}
            style={{ width: 'auto' }}
          />
          <label htmlFor="te-include-msgs" style={{ margin: 0, cursor: 'pointer' }}>Include Message Activities</label>
        </div>

        <div className="form-actions" style={{ marginTop: '2rem' }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Start Engaging</button>
          <button type="button" className="btn" style={{ background: '#48484a' }} onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
};
