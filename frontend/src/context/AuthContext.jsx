import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, DEMO_MODE } from '../lib/supabase';

const AuthContext = createContext(null);

// Synthetic approved-admin identity used while DEMO_MODE is on.
const DEMO_USER    = { id: 'demo-user', email: 'demo@nbtechai.com' };
const DEMO_PROFILE = { approved: true, role: 'admin', full_name: 'Demo User', email: 'demo@nbtechai.com' };

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(DEMO_MODE ? DEMO_USER    : null);
  const [profile, setProfile] = useState(DEMO_MODE ? DEMO_PROFILE : null);  // {approved, role, ...}
  const [loading, setLoading] = useState(!DEMO_MODE);

  // Fetch the profile row so we know approval status
  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('approved, role, full_name, email')
      .eq('id', userId)
      .single();
    if (!error) setProfile(data);
  }

  useEffect(() => {
    // Demo mode: no Supabase client — keep the synthetic identity, skip auth.
    if (DEMO_MODE) return;

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id).finally(() => setLoading(false));
      else    setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) await fetchProfile(u.id);
        else   setProfile(null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const demoDisabled = { data: null, error: new Error('Auth is disabled in demo mode') };

  async function signUp(email, password, fullName) {
    if (DEMO_MODE) return demoDisabled;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { data, error };
  }

  async function signIn(email, password) {
    if (DEMO_MODE) return demoDisabled;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signOut() {
    if (DEMO_MODE) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  const value = {
    user,
    profile,
    loading,
    isApproved: profile?.approved === true,
    isAdmin:    profile?.role === 'admin',
    signUp,
    signIn,
    signOut,
    refreshProfile: () => user && fetchProfile(user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
