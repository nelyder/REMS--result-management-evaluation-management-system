import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured, recoveryLink } from '../services/supabase.js';
import { authService } from '../services/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // `user` is the server-verified profile ({ id, fullName, email, role, ... }), never a
  // value derived from the client-side session alone.
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // True after the user follows a password-reset email link (Supabase recovery session).
  const [recovery, setRecovery] = useState(recoveryLink.opened);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await authService.me();
      setUser(data);
      return data;
    } catch (err) {
      setUser(null);
      if (err.status === 403 && supabase) await supabase.auth.signOut();
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await loadProfile().catch(() => {});
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setUser(null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    const onUnauthorized = () => setUser(null);
    window.addEventListener('rems:unauthorized', onUnauthorized);
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('rems:unauthorized', onUnauthorized);
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email, password) => {
      if (!supabase) {
        throw new Error('Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Invalid email or password.');
      return loadProfile();
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setRecovery(false);
  }, []);

  // Password operations are Supabase Auth calls (authentication only, like sign-in).
  const requestPasswordReset = useCallback(async (email) => {
    if (!supabase) throw new Error('Authentication is not configured.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Same outcome whether or not the account exists, so emails cannot be enumerated.
    if (error && error.status === 429) throw new Error('Too many requests. Wait a few minutes and try again.');
  }, []);

  const setNewPassword = useCallback(async (password) => {
    if (!supabase) throw new Error('Authentication is not configured.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      throw new Error(
        error.code === 'same_password'
          ? 'Choose a password different from your current one.'
          : error.code === 'weak_password'
            ? 'That password is too weak. Use a longer password.'
            : 'Could not update the password. Your link may have expired; request a new one.',
      );
    }
  }, []);

  // Signed-in change: re-verify the current password first so an unattended session
  // cannot be used to take over the account.
  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!supabase || !user) throw new Error('You are not signed in.');
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (error) throw new Error('Your current password is incorrect.');
      await setNewPassword(newPassword);
    },
    [user, setNewPassword],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      recovery,
      signIn,
      signOut,
      refresh: loadProfile,
      requestPasswordReset,
      setNewPassword,
      changePassword,
    }),
    [user, loading, recovery, signIn, signOut, loadProfile, requestPasswordReset, setNewPassword, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const homePathForRole = (role) =>
  ({ admin: '/admin', lecturer: '/lecturer', student: '/student' })[role] || '/login';
