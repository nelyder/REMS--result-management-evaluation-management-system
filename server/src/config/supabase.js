import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/**
 * Service-role client. Bypasses RLS — use ONLY for:
 *  - verifying access tokens and loading the caller's profile,
 *  - managing Auth users (create / ban / unban).
 * Never use it for ordinary data reads or writes.
 */
export const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, noSession);

/** Per-request client acting as the signed-in user, so RLS and audit triggers see auth.uid(). */
export function createUserClient(accessToken) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
