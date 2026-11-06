import { check } from '../utils/httpError.js';
import { listMeta, pageRange, searchFilter } from '../utils/query.js';
import { mapSummaryRow } from '../utils/mappers.js';
import { summarizeResults } from '../utils/evaluation.js';
import { myResults, publishedResultsFor } from './resultService.js';
import { getStudent } from './peopleService.js';

// All report queries use the caller's client, so RLS limits lecturers to their
// assigned courses automatically; admin reports are institution-wide.

async function summaryRows(db, { academicPeriodId } = {}) {
  let query = db.from('course_result_summary').select('*');
  if (academicPeriodId) query = query.eq('academic_period_id', academicPeriodId);
  return check(await query).data;
}

const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);

export async function overview(db, user, { academicPeriodId } = {}) {
  const rows = await summaryRows(db, { academicPeriodId });
  const passCount = sum(rows, 'pass_count');
  const failCount = sum(rows, 'fail_count');
  const evaluated = passCount + failCount;
  const common = {
    passCount,
    failCount,
    evaluatedResults: evaluated,
    passRate: evaluated ? passCount / evaluated : null,
    publishedResults: sum(rows, 'published'),
    // Publication progress: published + ready to publish + incomplete covers the enrolled students.
    readyToPublish: sum(rows, 'ready_to_publish'),
    incompleteResults: sum(rows, 'incomplete'),
  };

  if (user.role === 'lecturer') {
    let q = db.from('course_assignments').select('id', { count: 'exact', head: true }).eq('lecturer_id', user.lecturerId);
    if (academicPeriodId) q = q.eq('academic_period_id', academicPeriodId);
    const { count } = check(await q);
    return {
      ...common,
      courses: count ?? 0,
      enrolledStudents: sum(rows, 'enrolled'),
      resultsEntered: sum(rows, 'results_entered'),
    };
  }

  const countOf = async (table, filter) => {
    let q = db.from(table).select('id', { count: 'exact', head: true });
    if (filter) q = filter(q);
    return check(await q).count ?? 0;
  };
  const [students, activeStudents, lecturers, courses] = await Promise.all([
    countOf('students'),
    countOf('student_directory', (q) => q.eq('account_status', 'active')),
    countOf('lecturers'),
    countOf('courses'),
  ]);
  return { ...common, students, activeStudents, lecturers, courses };
}

export async function coursePerformance(db, user, q) {
  const { from, to } = pageRange(q);
  let query = db.from('course_result_summary').select('*', { count: 'exact' });
  if (q.academicPeriodId) query = query.eq('academic_period_id', q.academicPeriodId);
  if (q.courseId) query = query.eq('course_id', q.courseId);
  if (q.pendingOnly) query = query.or('draft.gt.0,submitted.gt.0');
  const or = searchFilter(q.search, ['course_code', 'course_name']);
  if (or) query = query.or(or);
  const { data, count } = check(
    await query.order('start_date', { ascending: false }).order('course_code').range(from, to),
  );
  return { data: data.map(mapSummaryRow), meta: listMeta(q, count) };
}

const gradeOrder = (g) => {
  const base = g.charCodeAt(0) * 3;
  return g.endsWith('+') ? base : g.endsWith('-') ? base + 2 : base + 1;
};

export async function gradeDistribution(db, user, { academicPeriodId, courseId } = {}) {
  let query = db.from('grade_counts').select('grade, total, publication_status');
  // Institution-wide view counts only what students can see; lecturers see their own drafts too.
  if (user.role === 'admin') query = query.in('publication_status', ['published', 'corrected']);
  if (academicPeriodId) query = query.eq('academic_period_id', academicPeriodId);
  if (courseId) query = query.eq('course_id', courseId);
  const { data } = check(await query);
  const totals = new Map();
  for (const r of data) totals.set(r.grade, (totals.get(r.grade) ?? 0) + r.total);
  return [...totals.entries()]
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => gradeOrder(a.grade) - gradeOrder(b.grade));
}

export async function studentSummary(db, user) {
  return summarizeStudentResults(await myResults(db, user));
}

function summarizeStudentResults(results) {
  return summarizeResults(
    results.map((r) => ({
      totalMark: r.totalMark,
      gradePoint: r.gradePoint,
      resultStatus: r.resultStatus,
      creditUnits: r.course.creditUnits,
      academicPeriod: r.academicPeriod,
    })),
  );
}

/**
 * Official statement data for one student, as an administrator sees it: the same
 * published-only results and summary the student gets from /students/me/*.
 */
export async function studentStatement(db, studentId) {
  const student = await getStudent(db, studentId);
  const results = await publishedResultsFor(db, studentId);
  return { student, results, summary: summarizeStudentResults(results) };
}
