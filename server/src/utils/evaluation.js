// Pure result-evaluation functions. The database trigger results_before_write
// applies the same rules so the stored data is always consistent.

export const DEFAULT_SETTINGS = Object.freeze({
  courseworkMax: 40,
  examMax: 60,
  defaultPassMark: 50,
  lecturerCanPublish: false,
  lecturerCanCorrect: false,
});

export const roundMark = (n) => Math.round(n * 100) / 100;

/**
 * Validates one mark component. `null`/`undefined` means "not entered yet" and is
 * allowed (it is NOT treated as zero). Returns an error message or null.
 */
export function markError(value, max, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} must be a number.`;
  if (value < 0) return `${label} cannot be negative.`;
  if (value > max) return `${label} cannot exceed ${max}.`;
  if (Math.abs(roundMark(value) - value) > 1e-9) return `${label} may have at most 2 decimal places.`;
  return null;
}

/** Returns [{ path, message }] for invalid components (empty when valid). */
export function validateMarks({ courseworkMark, examinationMark }, settings = DEFAULT_SETTINGS) {
  const errors = [];
  const cw = markError(courseworkMark, settings.courseworkMax, 'Coursework mark');
  const ex = markError(examinationMark, settings.examMax, 'Examination mark');
  if (cw) errors.push({ path: 'courseworkMark', message: cw });
  if (ex) errors.push({ path: 'examinationMark', message: ex });
  return errors;
}

/** Total of both components, or null if either is missing. */
export function computeTotal(courseworkMark, examinationMark) {
  if (courseworkMark == null || examinationMark == null) return null;
  const total = roundMark(courseworkMark + examinationMark);
  if (total < 0 || total > 100) throw new RangeError('Total mark must be between 0 and 100.');
  return total;
}

/** Finds the band whose inclusive [minimumMark, maximumMark] contains total. */
export function findGradeBand(total, bands) {
  if (total == null) return null;
  return bands.find((b) => total >= Number(b.minimumMark) && total <= Number(b.maximumMark)) ?? null;
}

export const resolvePassMark = (course, settings = DEFAULT_SETTINGS) =>
  course?.passMark ?? course?.pass_mark ?? settings.defaultPassMark;

export const determinePassFail = (total, passMark) => (total >= passMark ? 'pass' : 'fail');

/**
 * Full evaluation. Throws an Error with `.details` when marks are invalid.
 * Returns { totalMark, grade, gradePoint, resultStatus }.
 */
export function evaluateResult(marks, { settings = DEFAULT_SETTINGS, passMark, bands }) {
  const errors = validateMarks(marks, settings);
  if (errors.length) {
    const err = new Error('Invalid marks.');
    err.details = errors;
    throw err;
  }
  const totalMark = computeTotal(marks.courseworkMark, marks.examinationMark);
  if (totalMark === null) return { totalMark: null, grade: null, gradePoint: null, resultStatus: 'incomplete' };
  const band = findGradeBand(totalMark, bands);
  if (!band) throw new Error(`No grade band covers a total of ${totalMark}. Check the grading scale.`);
  return {
    totalMark,
    grade: band.grade,
    gradePoint: band.gradePoint ?? null,
    resultStatus: determinePassFail(totalMark, passMark ?? settings.defaultPassMark),
  };
}

/** Grading scale must be contiguous (0.01 steps), cover 0–100, and have unique grades. */
export function validateGradingBands(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return 'Add at least one grade band.';
  const sorted = [...bands].sort((a, b) => a.minimumMark - b.minimumMark);
  for (const b of sorted) {
    if (b.minimumMark < 0 || b.maximumMark > 100 || b.minimumMark > b.maximumMark) {
      return `Band ${b.grade}: marks must satisfy 0 ≤ min ≤ max ≤ 100.`;
    }
  }
  if (sorted[0].minimumMark !== 0) return 'The lowest band must start at 0.';
  if (sorted.at(-1).maximumMark !== 100) return 'The highest band must end at 100.';
  for (let i = 1; i < sorted.length; i++) {
    const gap = roundMark(sorted[i].minimumMark - sorted[i - 1].maximumMark);
    if (gap <= 0) return `Bands ${sorted[i - 1].grade} and ${sorted[i].grade} overlap.`;
    if (gap !== 0.01) return `There is a gap between bands ${sorted[i - 1].grade} and ${sorted[i].grade}.`;
  }
  const grades = bands.map((b) => b.grade);
  if (new Set(grades).size !== grades.length) return 'Grade letters must be unique.';
  return null;
}

/**
 * Builds a student's academic summary from complete, published results.
 * Averages are weighted by credit units; GPA uses grade points when configured.
 * Each result: { totalMark, gradePoint, resultStatus, creditUnits, academicPeriod }.
 */
export function summarizeResults(results) {
  const complete = results.filter((r) => r.resultStatus !== 'incomplete' && r.totalMark != null);

  const aggregate = (rows) => {
    const credits = rows.reduce((s, r) => s + r.creditUnits, 0);
    const passed = rows.filter((r) => r.resultStatus === 'pass');
    const gpRows = rows.filter((r) => r.gradePoint != null);
    const gpCredits = gpRows.reduce((s, r) => s + r.creditUnits, 0);
    return {
      courses: rows.length,
      passCount: passed.length,
      failCount: rows.length - passed.length,
      creditsAttempted: credits,
      creditsPassed: passed.reduce((s, r) => s + r.creditUnits, 0),
      average: credits ? roundMark(rows.reduce((s, r) => s + r.totalMark * r.creditUnits, 0) / credits) : null,
      gpa: gpCredits ? roundMark(gpRows.reduce((s, r) => s + r.gradePoint * r.creditUnits, 0) / gpCredits) : null,
    };
  };

  const byPeriod = new Map();
  for (const r of complete) {
    const key = r.academicPeriod.id;
    if (!byPeriod.has(key)) byPeriod.set(key, { academicPeriod: r.academicPeriod, rows: [] });
    byPeriod.get(key).rows.push(r);
  }
  const periods = [...byPeriod.values()]
    .sort((a, b) => String(a.academicPeriod.startDate).localeCompare(String(b.academicPeriod.startDate)))
    .map(({ academicPeriod, rows }) => ({ academicPeriod, ...aggregate(rows) }));

  const cumulative = aggregate(complete);
  const { creditsPassed, ...rest } = cumulative;
  return { periods, cumulative: { ...rest, creditsEarned: creditsPassed } };
}
