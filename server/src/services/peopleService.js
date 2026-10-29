import { adminClient } from '../config/supabase.js';
import { HttpError, check, conflict, forbidden, notFound } from '../utils/httpError.js';
import { applySort, listMeta, pageRange, searchFilter } from '../utils/query.js';
import { mapLecturer, mapStudent } from '../utils/mappers.js';

const BAN_FOREVER = '876000h'; // ~100 years

/**
 * Creates an Auth user (service role) and then the profile + role record in one
 * database transaction AS THE ADMIN (user client), so RLS applies and the audit
 * trigger records who did it. If the database step fails, the Auth user is removed.
 */
async function createPerson(db, actor, { email, password, fullName, role, record }) {
  const { data: created, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  });
  if (error) {
    if (error.status === 422 || /already/i.test(error.message)) throw conflict('An account with this email already exists.');
    throw new HttpError(502, 'AUTH_ERROR', 'Could not create the sign-in account.');
  }
  const userId = created.user.id;
  try {
    const { data } = check(
      await db.rpc('create_person_record', {
        p_profile_id: userId,
        p_full_name: fullName,
        p_email: email,
        p_role: role,
        ...record,
      }),
      { conflictMessage: role === 'student' ? 'This registration number is already in use.' : 'This staff number is already in use.' },
    );
    return data;
  } catch (err) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------- students
const studentSort = { registrationNumber: 'registration_number', fullName: 'full_name', yearOfStudy: 'year_of_study' };

export async function listStudents(db, q) {
  const { from, to } = pageRange(q);
  let query = db.from('student_directory').select('*', { count: 'exact' });
  const or = searchFilter(q.search, ['full_name', 'email', 'registration_number']);
  if (or) query = query.or(or);
  if (q.programmeId) query = query.eq('programme_id', q.programmeId);
  if (q.yearOfStudy) query = query.eq('year_of_study', q.yearOfStudy);
  if (q.accountStatus) query = query.eq('account_status', q.accountStatus);
  const { data, count } = check(await applySort(query, q, studentSort, { column: 'registration_number' }).range(from, to));
  return { data: data.map(mapStudent), meta: listMeta(q, count) };
}

export async function getStudent(db, id) {
  const { data } = check(await db.from('student_directory').select('*').eq('id', id).maybeSingle());
  if (!data) throw notFound('Student not found.');
  return mapStudent(data);
}

export async function createStudent(db, actor, body) {
  const id = await createPerson(db, actor, {
    email: body.email,
    password: body.password,
    fullName: body.fullName,
    role: 'student',
    record: {
      p_registration_number: body.registrationNumber,
      p_programme_id: body.programmeId,
      p_year_of_study: body.yearOfStudy,
    },
  });
  return getStudent(db, id);
}

export async function updateStudent(db, id, body) {
  check(
    await db.rpc('update_student_record', {
      p_student_id: id,
      p_full_name: body.fullName,
      p_registration_number: body.registrationNumber,
      p_programme_id: body.programmeId,
      p_year_of_study: body.yearOfStudy,
    }),
    { conflictMessage: 'This registration number is already in use.' },
  );
  return getStudent(db, id);
}

// ---------------------------------------------------------------- lecturers
const lecturerSort = { staffNumber: 'staff_number', fullName: 'full_name' };

export async function listLecturers(db, q) {
  const { from, to } = pageRange(q);
  let query = db.from('lecturer_directory').select('*', { count: 'exact' });
  const or = searchFilter(q.search, ['full_name', 'email', 'staff_number']);
  if (or) query = query.or(or);
  if (q.departmentId) query = query.eq('department_id', q.departmentId);
  const { data, count } = check(await applySort(query, q, lecturerSort, { column: 'full_name' }).range(from, to));
  return { data: data.map(mapLecturer), meta: listMeta(q, count) };
}

async function getLecturer(db, id) {
  const { data } = check(await db.from('lecturer_directory').select('*').eq('id', id).maybeSingle());
  if (!data) throw notFound('Lecturer not found.');
  return mapLecturer(data);
}

export async function createLecturer(db, actor, body) {
  const id = await createPerson(db, actor, {
    email: body.email,
    password: body.password,
    fullName: body.fullName,
    role: 'lecturer',
    record: { p_staff_number: body.staffNumber, p_department_id: body.departmentId },
  });
  return getLecturer(db, id);
}

export async function updateLecturer(db, id, body) {
  check(
    await db.rpc('update_lecturer_record', {
      p_lecturer_id: id,
      p_full_name: body.fullName,
      p_staff_number: body.staffNumber,
      p_department_id: body.departmentId,
    }),
    { conflictMessage: 'This staff number is already in use.' },
  );
  return getLecturer(db, id);
}

// ---------------------------------------------------------------- account status
/**
 * Activates/deactivates an account. The profile update goes through the admin's
 * client (audited); the Auth ban stops sign-in and token refresh immediately.
 */
export async function setAccountStatus(db, actor, profileId, accountStatus) {
  if (profileId === actor.id) throw forbidden('You cannot change the status of your own account.');
  const { data } = check(
    await db.from('profiles').update({ account_status: accountStatus }).eq('id', profileId).select('id, account_status').maybeSingle(),
  );
  if (!data) throw notFound('Account not found.');
  const { error } = await adminClient.auth.admin.updateUserById(profileId, {
    ban_duration: accountStatus === 'active' ? 'none' : BAN_FOREVER,
  });
  if (error) throw new HttpError(502, 'AUTH_ERROR', 'Status saved, but the sign-in account could not be updated. Try again.');
  return { id: data.id, accountStatus: data.account_status };
}
