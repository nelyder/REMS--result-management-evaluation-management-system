import { adminClient, createUserClient } from '../config/supabase.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import { mapProfile } from '../utils/mappers.js';

const PROFILE_SELECT = `id, full_name, email, role, account_status, created_at,
  student:students(id, registration_number, year_of_study, programme:programmes(id, programme_code, programme_name)),
  lecturer:lecturers(id, staff_number, department:departments(id, department_code, department_name))`;

/**
 * Verifies the Supabase access token, then loads the caller's role and status
 * from the database. Nothing about identity or role is taken from the request
 * body or custom headers.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token || token.length > 4096) throw unauthorized();

    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data?.user) throw unauthorized('Your session is invalid or has expired. Please sign in again.');

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw forbidden('Your account has not been set up. Contact an administrator.');
    if (profile.account_status !== 'active') throw forbidden('Your account is inactive. Contact an administrator.');

    req.user = mapProfile(profile);
    req.db = createUserClient(token);
    next();
  } catch (err) {
    next(err);
  }
}
