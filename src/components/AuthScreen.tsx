import React, { useState } from 'react';
import { getAuthUrl, saveToken, isValidTokenFormat } from '../utils/anilist-auth';

interface AuthScreenProps {
  onTokenSubmitted: (token: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onTokenSubmitted }) => {
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');

  const handleConnectClick = () => {
    // Open the OAuth URL in a new tab
    window.open(getAuthUrl(), '_blank');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError('Please paste a token.');
      return;
    }
    if (!isValidTokenFormat(tokenInput)) {
      setError('The token format appears invalid. It should be a long string without spaces.');
      return;
    }
    
    setError('');
    saveToken(tokenInput);
    onTokenSubmitted(tokenInput);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h2>Connect AniList</h2>
        <p className="auth-description">
          AniFollows requires an access token to interact with your AniList account.
        </p>
        
        <div className="auth-step">
          <span className="step-number">1</span>
          <p>Click below to authorize the application on AniList.</p>
          <button className="btn btn-primary m-medium" onClick={handleConnectClick}>
            Authorize on AniList
          </button>
        </div>
        
        <div className="auth-step">
          <span className="step-number">2</span>
          <p>Copy the token provided on the PIN page and paste it below:</p>
          <form onSubmit={handleSubmit} className="auth-form">
            <input
              type="password"
              placeholder="Paste Access Token here..."
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.currentTarget.value);
                setError('');
              }}
              className="token-input"
            />
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn m-medium">Submit Token</button>
          </form>
        </div>
      </div>
    </div>
  );
};
