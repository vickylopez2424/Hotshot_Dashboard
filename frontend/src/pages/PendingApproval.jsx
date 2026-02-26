import React from 'react';
import { useAuth } from '../context/AuthContext';
import './PendingApproval.css';

export default function PendingApproval() {
  const { user, signOut, refreshProfile, isApproved } = useAuth();

  async function checkStatus() {
    await refreshProfile();
    if (isApproved) window.location.replace('/');
  }

  return (
    <div className="pending-page">
      <div className="pending-card">
        <div className="pending-icon">⏳</div>
        <h1>Account Pending Approval</h1>
        <p>
          Thanks for signing up! Your account is currently under review.
          An admin will manually approve your access — you'll receive an
          email once you're granted access to the dashboard.
        </p>

        {user?.email && (
          <div className="pending-email">
            Signed in as <strong>{user.email}</strong>
          </div>
        )}

        <div className="pending-actions">
          <button className="btn-check" onClick={checkStatus}>
            Check Status
          </button>
          <button className="btn-signout" onClick={signOut}>
            Sign Out
          </button>
        </div>

        <p className="pending-note">
          Questions? Contact <a href="mailto:admin@nbtechai.com">admin@nbtechai.com</a>
        </p>
      </div>
    </div>
  );
}
