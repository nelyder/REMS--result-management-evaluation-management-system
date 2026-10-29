import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Read before createClient: detectSessionInUrl consumes and clears the URL hash, and the
// PASSWORD_RECOVERY event can fire before React subscribes to auth changes.
const hash = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.slice(1));
export const recoveryLink = {
  opened: hash.get('type') === 'recovery',
  error: hash.get('error_description') || (hash.get('error') ? 'This link is invalid or has expired.' : null),
};

// The browser uses Supabase only for authentication (publishable/anon key).
// All data access goes through the Express API, which enforces permissions.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
