// Client-side PREVIEW of result evaluation for instant feedback while typing.
// The server recomputes everything and is authoritative; never send these values to the API.

export function parseMark(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export function validateMark(raw, max, label) {
  const n = parseMark(raw);
  if (n === null) return null;
  if (Number.isNaN(n)) return `${label} must be a number`;
  if (n < 0) return `${label} cannot be negative`;
  if (n > max) return `${label} cannot exceed ${max}`;
  if (Math.round(n * 100) !== n * 100) return `${label} allows at most 2 decimal places`;
  return null;
}

export function previewResult({ coursework, exam }, { courseworkMax, examMax, passMark, scales }) {
  const cw = parseMark(coursework);
  const ex = parseMark(exam);
  const errors = {
    coursework: validateMark(coursework, courseworkMax, 'Coursework'),
    exam: validateMark(exam, examMax, 'Exam'),
  };
  if (errors.coursework || errors.exam) return { errors, total: null, grade: null, status: null };
  if (cw === null || ex === null) return { errors, total: null, grade: null, status: 'incomplete' };
  const total = Math.round((cw + ex) * 100) / 100;
  const band = (scales || []).find((s) => total >= Number(s.minimumMark) && total <= Number(s.maximumMark));
  return { errors, total, grade: band?.grade ?? null, status: total >= passMark ? 'pass' : 'fail' };
}
