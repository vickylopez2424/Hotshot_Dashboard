import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export default function AuthPage() {
  const [params]    = useSearchParams();
  const navigate    = useNavigate();
  const { signIn, signUp, user, isApproved } = useAuth();

  const [mode,     setMode]     = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error,    setError]    = useState('');
  const [info,     setInfo]     = useState('');
  const [busy,     setBusy]     = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(isApproved ? '/' : '/pending', { replace: true });
    }
  }, [user, isApproved, navigate]);

  function switchMode(m) {
    setMode(m);
    setError('');
    setInfo('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) throw error;
        // AuthContext listener handles redirect via useEffect above
      } else {
        if (!fullName.trim()) { setError('Please enter your full name.'); setBusy(false); return; }
        const { data, error } = await signUp(email, password, fullName.trim());
        if (error) throw error;
        // Supabase may require email confirmation — check session
        if (data?.session) {
          navigate('/pending', { replace: true });
        } else {
          setInfo(
            'Account created! Check your email to confirm your address, then come back to sign in. ' +
            'Once confirmed, an admin will review and approve your account.'
          );
        }
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-logo">
          <span>🔥</span> Hotshot Dashboard
        </Link>

        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'tab active' : 'tab'}
            onClick={() => switchMode('login')}
          >
            Sign In
          </button>
          <button
            className={mode === 'signup' ? 'tab active' : 'tab'}
            onClick={() => switchMode('signup')}
          >
            Request Access
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {info  && <div className="auth-info">{info}</div>}

        {!info && (
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'signup' && (
              <div className="field">
                <label>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoFocus
                />
              </div>
            )}

            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus={mode === 'login'}
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 8 characters' : ''}
                minLength={mode === 'signup' ? 8 : undefined}
                required
              />
            </div>

            <button type="submit" className="btn-submit" disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>
        )}

        {mode === 'signup' && !info && (
          <p className="auth-note">
            Accounts require manual admin approval. You'll be notified when
            your access is granted.
          </p>
        )}
      </div>
    </div>
  );
}
