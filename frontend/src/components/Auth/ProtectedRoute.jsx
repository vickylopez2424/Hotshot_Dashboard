import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Wraps dashboard routes.
 * - Not logged in → /auth
 * - Logged in but not approved → /pending
 * - Approved → renders children
 */
export default function ProtectedRoute({ children }) {
  const { user, isApproved, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d1117', color: '#e6edf3' }}>
        Loading…
      </div>
    );
  }

  if (!user)       return <Navigate to="/welcome" replace />;
  if (!isApproved) return <Navigate to="/pending" replace />;

  return children;
}
