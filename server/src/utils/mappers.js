// snake_case database rows -> camelCase API objects. Only whitelisted fields leave the server.

const num = (v) => (v === null || v === undefined ? null : Number(v));
const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export const mapPeriod = (p) =>
  p && {
    id: p.id,
    academicYear: p.academic_year,
    semester: p.semester,
    startDate: p.start_date,
    endDate: p.end_date,
    status: p.status,
  };

/** Period fields embedded in view rows (academic_year, semester, start_date, period_status). */
const periodFromRow = (r) => ({
  id: r.academic_period_id,
  academicYear: r.academic_year,
  semester: r.semester,
  startDate: r.start_date,
  status: r.period_status,
});

export const mapDepartment = (d) => d && { id: d.id, name: d.department_name, code: d.department_code };

export const mapProgramme = (p) =>
  p && {
    id: p.id,
    name: p.programme_name,
    code: p.programme_code,
    departmentId: p.department_id,
    department: mapDepartment(one(p.department)),
  };

export const mapCourse = (c) =>
  c && {
    id: c.id,
    code: c.course_code,
    name: c.course_name,
    creditUnits: c.credit_units,
    departmentId: c.department_id,
    department: mapDepartment(one(c.department)),
    passMark: num(c.pass_mark),
  };

export function mapProfile(p) {
  const student = one(p.student);
  const lecturer = one(p.lecturer);
  return {
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    role: p.role,
    accountStatus: p.account_status,
    createdAt: p.created_at,
    studentId: student?.id ?? null,
    lecturerId: lecturer?.id ?? null,
    student: student && {
      id: student.id,
      registrationNumber: student.registration_number,
      yearOfStudy: student.year_of_study,
      programme: student.programme && {
        id: student.programme.id,
        code: student.programme.programme_code,
        name: student.programme.programme_name,
      },
    },
    lecturer: lecturer && {
      id: lecturer.id,
      staffNumber: lecturer.staff_number,
      department: mapDepartment(lecturer.department),
    },
  };
}

export const mapStudent = (s) => ({
  id: s.id,
  profileId: s.profile_id,
  fullName: s.full_name,
  email: s.email,
  accountStatus: s.account_status,
  registrationNumber: s.registration_number,
  programmeId: s.programme_id,
  programme: { id: s.programme_id, code: s.programme_code, name: s.programme_name },
  yearOfStudy: s.year_of_study,
  createdAt: s.created_at,
});

export const mapLecturer = (l) => ({
  id: l.id,
  profileId: l.profile_id,
  fullName: l.full_name,
  email: l.email,
  accountStatus: l.account_status,
  staffNumber: l.staff_number,
  departmentId: l.department_id,
  department: { id: l.department_id, code: l.department_code, name: l.department_name },
  assignedCourses: l.assigned_courses ?? 0,
  createdAt: l.created_at,
});

export const mapAssignment = (a) => ({
  id: a.id,
  lecturerId: a.lecturer_id,
  courseId: a.course_id,
  academicPeriodId: a.academic_period_id,
  lecturer: { id: a.lecturer_id, fullName: a.lecturer_name, staffNumber: a.staff_number },
  course: { id: a.course_id, code: a.course_code, name: a.course_name, creditUnits: a.credit_units, passMark: num(a.pass_mark) },
  academicPeriod: periodFromRow(a),
  enrolledCount: a.enrolled_count,
  completeCount: a.complete_count,
  draft: a.draft_count,
  submitted: a.submitted_count,
  published: a.published_count,
});

export const mapResult = (r) => ({
  id: r.id,
  enrollmentId: r.enrollment_id,
  courseworkMark: num(r.coursework_mark),
  examinationMark: num(r.examination_mark),
  totalMark: num(r.total_mark),
  grade: r.grade,
  gradePoint: num(r.grade_point),
  resultStatus: r.result_status,
  publicationStatus: r.publication_status,
  version: r.version,
  correctionReason: r.correction_reason ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  publishedAt: r.published_at,
});

/** Row from the result_details view. */
export const mapResultDetail = (r) => ({
  ...mapResult(r),
  student: { id: r.student_id, fullName: r.student_name, registrationNumber: r.registration_number },
  course: { id: r.course_id, code: r.course_code, name: r.course_name, creditUnits: r.credit_units },
  academicPeriod: periodFromRow(r),
});

/** Row from the enrollment_details view. */
export const mapEnrollment = (e) => ({
  id: e.id,
  studentId: e.student_id,
  courseId: e.course_id,
  academicPeriodId: e.academic_period_id,
  enrollmentStatus: e.enrollment_status,
  student: {
    id: e.student_id,
    fullName: e.full_name,
    registrationNumber: e.registration_number,
    yearOfStudy: e.year_of_study,
    programme: { code: e.programme_code, name: e.programme_name },
  },
  result: e.result_id
    ? {
        id: e.result_id,
        courseworkMark: num(e.coursework_mark),
        examinationMark: num(e.examination_mark),
        totalMark: num(e.total_mark),
        grade: e.grade,
        gradePoint: num(e.grade_point),
        resultStatus: e.result_status,
        publicationStatus: e.publication_status,
        version: e.version,
        updatedAt: e.result_updated_at,
        publishedAt: e.published_at,
      }
    : null,
});

export const mapSummaryRow = (r) => ({
  courseId: r.course_id,
  courseCode: r.course_code,
  courseName: r.course_name,
  academicPeriodId: r.academic_period_id,
  academicPeriod: periodFromRow(r),
  lecturerName: r.lecturer_name,
  enrolled: r.enrolled,
  resultsEntered: r.results_entered,
  incomplete: r.incomplete,
  draft: r.draft,
  submitted: r.submitted,
  published: r.published,
  readyToPublish: r.ready_to_publish,
  passCount: r.pass_count,
  failCount: r.fail_count,
  passRate: r.pass_count + r.fail_count ? r.pass_count / (r.pass_count + r.fail_count) : null,
  mean: num(r.mean_mark),
  highest: num(r.highest_mark),
  lowest: num(r.lowest_mark),
});

export const mapAudit = (a) => ({
  id: a.id,
  action: a.action,
  entityType: a.entity_type,
  entityId: a.entity_id,
  previousValues: a.previous_values,
  newValues: a.new_values,
  createdAt: a.created_at,
  actor: a.actor ? { id: a.actor_id, fullName: one(a.actor)?.full_name } : null,
});

export const mapSettings = (s) => ({
  courseworkMax: num(s.coursework_max),
  examMax: num(s.exam_max),
  defaultPassMark: num(s.default_pass_mark),
  lecturerCanPublish: s.lecturer_can_publish,
  lecturerCanCorrect: s.lecturer_can_correct,
  updatedAt: s.updated_at,
});

export const mapBand = (b) => ({
  id: b.id,
  grade: b.grade,
  minimumMark: num(b.minimum_mark),
  maximumMark: num(b.maximum_mark),
  gradePoint: num(b.grade_point),
  description: b.description,
});
