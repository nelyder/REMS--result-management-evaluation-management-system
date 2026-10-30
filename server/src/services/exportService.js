import ExcelJS from 'exceljs';
import { check, notFound } from '../utils/httpError.js';
import { assertCanManageCourse } from './accessService.js';

const COLUMNS = [
  { header: 'Registration number', key: 'registrationNumber', width: 20 },
  { header: 'Student name', key: 'fullName', width: 30 },
  { header: 'Programme', key: 'programme', width: 12 },
  { header: 'Coursework', key: 'coursework', width: 12 },
  { header: 'Examination', key: 'exam', width: 12 },
  { header: 'Total', key: 'total', width: 10 },
  { header: 'Grade', key: 'grade', width: 8 },
  { header: 'Result', key: 'result', width: 12 },
  { header: 'Status', key: 'status', width: 12 },
];

/** Prevents CSV/Excel formula injection from user-controlled text. */
export const safeCell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function toCsv(rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(safeCell(v));
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLUMNS.map((c) => esc(c.header)).join(','), ...rows.map((r) => COLUMNS.map((c) => esc(r[c.key])).join(','))].join('\r\n');
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

/** Builds a course result sheet. Same permission rule as viewing the course's results. */
export async function exportCourseResults(db, user, courseId, { academicPeriodId, format }) {
  await assertCanManageCourse(db, user, courseId, academicPeriodId);
  const [course, period, enrollments] = await Promise.all([
    db.from('courses').select('course_code, course_name').eq('id', courseId).maybeSingle(),
    db.from('academic_periods').select('academic_year, semester').eq('id', academicPeriodId).maybeSingle(),
    db
      .from('enrollment_details')
      .select('*')
      .eq('course_id', courseId)
      .eq('academic_period_id', academicPeriodId)
      .neq('enrollment_status', 'withdrawn')
      .order('registration_number'),
  ]);
  if (!check(course).data || !check(period).data) throw notFound();
  const rows = check(enrollments).data.map((e) => ({
    registrationNumber: e.registration_number,
    fullName: e.full_name,
    programme: e.programme_code,
    coursework: num(e.coursework_mark),
    exam: num(e.examination_mark),
    total: num(e.total_mark),
    grade: e.grade ?? '',
    result: e.result_status ?? 'not entered',
    status: e.publication_status ?? '',
  }));

  const base = `${course.data.course_code.replace(/\s+/g, '')}_${period.data.academic_year.replace('/', '-')}_S${period.data.semester}`;
  if (format === 'csv') {
    return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: Buffer.from(`\uFEFF${toCsv(rows)}`, 'utf8') };
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'REMS';
  const ws = wb.addWorksheet('Results');
  ws.addRow([`${course.data.course_code} — ${course.data.course_name}`]).font = { bold: true, size: 13 };
  ws.addRow([`${period.data.academic_year}, Semester ${period.data.semester}`]);
  ws.addRow([]);
  ws.columns = COLUMNS.map(({ key, width }) => ({ key, width }));
  const header = ws.addRow(COLUMNS.map((c) => c.header));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6743BD' } };
  });
  for (const r of rows) ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])));
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return {
    filename: `${base}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}
