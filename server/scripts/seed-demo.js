// Optional DEVELOPMENT data: fictional lecturers, students, assignments,
// enrollments and results on top of supabase/seed.sql. Never run in production.
//   npm run seed:demo -w server
// All demo accounts share one randomly generated password, printed at the end.
import { randomBytes } from 'node:crypto';
import { adminClient as db } from '../src/config/supabase.js';
import { env } from '../src/config/env.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}

const PASSWORD = process.env.DEMO_PASSWORD || `Demo-${randomBytes(6).toString('base64url')}`;
const PERIOD_PAST = '44444444-0000-4000-8000-000000000002';
const PERIOD_CURRENT = '44444444-0000-4000-8000-000000000003';
const CS = '22222222-0000-4000-8000-000000000001';
const DEPT_CS = '11111111-0000-4000-8000-000000000001';
const DEPT_MTH = '11111111-0000-4000-8000-000000000002';
const COURSE = {
  CSC101: '33333333-0000-4000-8000-000000000001',
  CSC102: '33333333-0000-4000-8000-000000000002',
  MTH101: '33333333-0000-4000-8000-000000000004',
};

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function person({ email, fullName, role }) {
  const existing = must(await db.from('profiles').select('id').eq('email', email).maybeSingle(), 'lookup');
  if (existing) return existing.id;
  const { user } = must(
    await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } }),
    `create ${email}`,
  );
  must(await db.from('profiles').insert({ id: user.id, full_name: fullName, email, role }), 'profile');
  return user.id;
}

async function main() {
  const lecturers = [
    { email: 'l.okafor@example.edu', fullName: 'Lena Okafor', staff: 'STF/1001', dept: DEPT_CS },
    { email: 'm.haddad@example.edu', fullName: 'Marcus Haddad', staff: 'STF/1002', dept: DEPT_MTH },
  ];
  const lecturerIds = [];
  for (const l of lecturers) {
    const profileId = await person({ ...l, role: 'lecturer' });
    const row = must(
      await db.from('lecturers').upsert({ profile_id: profileId, staff_number: l.staff, department_id: l.dept }, { onConflict: 'profile_id' }).select('id').single(),
      'lecturer',
    );
    lecturerIds.push(row.id);
  }

  const names = ['Amina Test', 'Brian Sample', 'Chloe Example', 'Daniel Demo', 'Esi Placeholder', 'Farid Mock', 'Grace Fixture', 'Hugo Dummy'];
  const studentIds = [];
  for (const [i, fullName] of names.entries()) {
    const email = `student${i + 1}@example.edu`;
    const profileId = await person({ email, fullName, role: 'student' });
    const row = must(
      await db
        .from('students')
        .upsert(
          { profile_id: profileId, registration_number: `REG/2025/${String(i + 1).padStart(4, '0')}`, programme_id: CS, year_of_study: 1 },
          { onConflict: 'profile_id' },
        )
        .select('id')
        .single(),
      'student',
    );
    studentIds.push(row.id);
  }

  const offerings = [
    { lecturer: lecturerIds[0], course: COURSE.CSC101, period: PERIOD_PAST, publish: true },
    { lecturer: lecturerIds[1], course: COURSE.MTH101, period: PERIOD_PAST, publish: true },
    { lecturer: lecturerIds[0], course: COURSE.CSC102, period: PERIOD_CURRENT, publish: false },
    { lecturer: lecturerIds[1], course: COURSE.MTH101, period: PERIOD_CURRENT, publish: false },
  ];

  let seed = 7;
  const rand = (max) => {
    seed = (seed * 9301 + 49297) % 233280;
    return Math.round((seed / 233280) * max * 2) / 2;
  };

  for (const o of offerings) {
    must(
      await db
        .from('course_assignments')
        .upsert({ lecturer_id: o.lecturer, course_id: o.course, academic_period_id: o.period }, { onConflict: 'lecturer_id,course_id,academic_period_id', ignoreDuplicates: true }),
      'assignment',
    );
    const enrollments = must(
      await db
        .from('enrollments')
        .upsert(studentIds.map((s) => ({ student_id: s, course_id: o.course, academic_period_id: o.period })), {
          onConflict: 'student_id,course_id,academic_period_id',
        })
        .select('id'),
      'enrollments',
    );
    for (const [i, e] of enrollments.entries()) {
      // Current period: leave a couple of results incomplete to show the workflow.
      const exam = !o.publish && i >= 6 ? null : 18 + rand(42);
      const result = {
        enrollment_id: e.id,
        coursework_mark: 12 + rand(28),
        examination_mark: exam,
        publication_status: o.publish ? 'published' : 'draft',
      };
      must(await db.from('results').upsert(result, { onConflict: 'enrollment_id', ignoreDuplicates: true }), 'result');
    }
  }

  console.log('\nDemo data ready (fictional). Sign in with any of these accounts:');
  console.log('  lecturers: l.okafor@example.edu, m.haddad@example.edu');
  console.log('  students:  student1@example.edu … student8@example.edu');
  console.log(`  password:  ${PASSWORD}\n`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
