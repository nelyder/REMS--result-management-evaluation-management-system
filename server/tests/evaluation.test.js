import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  computeTotal,
  determinePassFail,
  evaluateResult,
  findGradeBand,
  resolvePassMark,
  summarizeResults,
  validateGradingBands,
  validateMarks,
} from '../src/utils/evaluation.js';
import { canPublish, editMode, publishError } from '../src/utils/resultPolicy.js';

const bands = [
  { grade: 'A', minimumMark: 80, maximumMark: 100, gradePoint: 4 },
  { grade: 'B', minimumMark: 70, maximumMark: 79.99, gradePoint: 3.5 },
  { grade: 'C', minimumMark: 60, maximumMark: 69.99, gradePoint: 3 },
  { grade: 'D', minimumMark: 50, maximumMark: 59.99, gradePoint: 2 },
  { grade: 'F', minimumMark: 0, maximumMark: 49.99, gradePoint: 0 },
];
const ctx = { settings: DEFAULT_SETTINGS, passMark: 50, bands };

describe('result calculation', () => {
  it('adds coursework and examination marks', () => {
    expect(computeTotal(32.5, 41.25)).toBe(73.75);
  });
  it('avoids floating point drift', () => {
    expect(computeTotal(0.1, 0.2)).toBe(0.3);
  });
  it('returns null (not 0) when a component is missing', () => {
    expect(computeTotal(30, null)).toBeNull();
    expect(computeTotal(undefined, 50)).toBeNull();
  });
  it('rejects totals outside 0–100', () => {
    expect(() => computeTotal(60, 60)).toThrow(RangeError);
  });
});

describe('grade assignment', () => {
  it.each([
    [100, 'A'],
    [80, 'A'],
    [79.99, 'B'],
    [70, 'B'],
    [59.5, 'D'],
    [50, 'D'],
    [49.99, 'F'],
    [0, 'F'],
  ])('total %d → %s', (total, grade) => {
    expect(findGradeBand(total, bands).grade).toBe(grade);
  });
  it('returns null when no band covers the total', () => {
    expect(findGradeBand(50, bands.slice(0, 3))).toBeNull();
  });
});

describe('pass/fail determination', () => {
  it('passes at exactly the pass mark and fails just below', () => {
    expect(determinePassFail(50, 50)).toBe('pass');
    expect(determinePassFail(49.99, 50)).toBe('fail');
  });
  it('uses the course pass mark over the default', () => {
    expect(resolvePassMark({ passMark: 45 }, DEFAULT_SETTINGS)).toBe(45);
    expect(resolvePassMark({ passMark: null }, DEFAULT_SETTINGS)).toBe(50);
    expect(evaluateResult({ courseworkMark: 20, examinationMark: 26 }, { ...ctx, passMark: 45 }).resultStatus).toBe('pass');
  });
});

describe('evaluateResult', () => {
  it('evaluates a complete result', () => {
    expect(evaluateResult({ courseworkMark: 35, examinationMark: 50 }, ctx)).toEqual({
      totalMark: 85,
      grade: 'A',
      gradePoint: 4,
      resultStatus: 'pass',
    });
  });
  it('marks a missing component as incomplete without a grade', () => {
    expect(evaluateResult({ courseworkMark: 35, examinationMark: null }, ctx)).toEqual({
      totalMark: null,
      grade: null,
      gradePoint: null,
      resultStatus: 'incomplete',
    });
  });
  it('fails a low but complete result', () => {
    expect(evaluateResult({ courseworkMark: 10, examinationMark: 20 }, ctx)).toMatchObject({ grade: 'F', resultStatus: 'fail' });
  });
  it('throws with details for invalid marks', () => {
    try {
      evaluateResult({ courseworkMark: 41, examinationMark: -1 }, ctx);
      expect.unreachable();
    } catch (err) {
      expect(err.details.map((d) => d.path)).toEqual(['courseworkMark', 'examinationMark']);
    }
  });
  it('throws when the grading scale has no matching band', () => {
    expect(() => evaluateResult({ courseworkMark: 20, examinationMark: 20 }, { ...ctx, bands: bands.slice(0, 2) })).toThrow(/No grade band/);
  });
});

describe('invalid marks', () => {
  it.each([
    [{ courseworkMark: 40.01, examinationMark: 10 }, 'courseworkMark', /exceed 40/],
    [{ courseworkMark: 10, examinationMark: 60.5 }, 'examinationMark', /exceed 60/],
    [{ courseworkMark: -0.5, examinationMark: 10 }, 'courseworkMark', /negative/],
    [{ courseworkMark: 10.555, examinationMark: 10 }, 'courseworkMark', /2 decimal/],
    [{ courseworkMark: Number.NaN, examinationMark: 10 }, 'courseworkMark', /number/],
    [{ courseworkMark: '30', examinationMark: 10 }, 'courseworkMark', /number/],
  ])('%j is rejected', (marks, path, message) => {
    const errors = validateMarks(marks, DEFAULT_SETTINGS);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe(path);
    expect(errors[0].message).toMatch(message);
  });
  it('accepts boundaries and missing values', () => {
    expect(validateMarks({ courseworkMark: 0, examinationMark: 60 }, DEFAULT_SETTINGS)).toEqual([]);
    expect(validateMarks({ courseworkMark: 40, examinationMark: null }, DEFAULT_SETTINGS)).toEqual([]);
  });
  it('respects a configured scheme', () => {
    const settings = { ...DEFAULT_SETTINGS, courseworkMax: 30, examMax: 70 };
    expect(validateMarks({ courseworkMark: 35, examinationMark: 65 }, settings)[0].path).toBe('courseworkMark');
  });
});

describe('validateGradingBands', () => {
  it('accepts a contiguous scale', () => expect(validateGradingBands(bands)).toBeNull());
  it('rejects overlap, gaps, bad bounds and duplicate grades', () => {
    expect(validateGradingBands([{ ...bands[0], minimumMark: 75 }, ...bands.slice(1)])).toMatch(/overlap/);
    expect(validateGradingBands([bands[0], bands[2], bands[3], bands[4]])).toMatch(/gap/);
    expect(validateGradingBands(bands.slice(0, 4))).toMatch(/start at 0/);
    expect(validateGradingBands(bands.slice(1))).toMatch(/end at 100/);
    expect(validateGradingBands([...bands.slice(0, 4), { ...bands[4], grade: 'A' }])).toMatch(/unique/);
    expect(validateGradingBands([])).toMatch(/at least one/);
  });
});

describe('summarizeResults', () => {
  const p1 = { id: 'p1', startDate: '2025-09-01' };
  const p2 = { id: 'p2', startDate: '2026-02-01' };
  it('weights averages and GPA by credit units and ignores incomplete results', () => {
    const s = summarizeResults([
      { totalMark: 80, gradePoint: 4, resultStatus: 'pass', creditUnits: 4, academicPeriod: p1 },
      { totalMark: 40, gradePoint: 0, resultStatus: 'fail', creditUnits: 2, academicPeriod: p1 },
      { totalMark: 70, gradePoint: 3.5, resultStatus: 'pass', creditUnits: 3, academicPeriod: p2 },
      { totalMark: null, gradePoint: null, resultStatus: 'incomplete', creditUnits: 3, academicPeriod: p2 },
    ]);
    expect(s.periods).toHaveLength(2);
    expect(s.periods[0]).toMatchObject({ courses: 2, passCount: 1, failCount: 1, creditsAttempted: 6, creditsPassed: 4, average: 66.67, gpa: 2.67 });
    expect(s.cumulative).toMatchObject({ courses: 3, creditsAttempted: 9, creditsEarned: 7, average: 67.78, gpa: 2.94 });
  });
  it('handles no results', () => {
    expect(summarizeResults([]).cumulative).toMatchObject({ courses: 0, average: null, gpa: null });
  });
});

describe('publication policy', () => {
  const locked = { ...DEFAULT_SETTINGS, lecturerCanPublish: false, lecturerCanCorrect: false };
  const open = { ...DEFAULT_SETTINGS, lecturerCanPublish: true, lecturerCanCorrect: true };
  it('lets lecturers edit drafts but not submitted results', () => {
    expect(editMode({ publicationStatus: 'draft', role: 'lecturer', settings: locked })).toBe('edit');
    expect(editMode({ publicationStatus: 'submitted', role: 'lecturer', settings: locked })).toBe('locked');
    expect(editMode({ publicationStatus: 'submitted', role: 'admin', settings: locked })).toBe('edit');
  });
  it('requires correction rights for published results', () => {
    expect(editMode({ publicationStatus: 'published', role: 'lecturer', settings: locked })).toBe('locked');
    expect(editMode({ publicationStatus: 'published', role: 'lecturer', settings: open })).toBe('correct');
    expect(editMode({ publicationStatus: 'corrected', role: 'admin', settings: locked })).toBe('correct');
  });
  it('never lets students edit', () => {
    expect(editMode({ publicationStatus: 'draft', role: 'student', settings: open })).toBe('locked');
  });
  it('controls who can publish', () => {
    expect(canPublish({ role: 'lecturer', settings: locked })).toBe(false);
    expect(canPublish({ role: 'lecturer', settings: open })).toBe(true);
    expect(canPublish({ role: 'admin', settings: locked })).toBe(true);
    expect(canPublish({ role: 'student', settings: open })).toBe(false);
  });
  it('refuses to publish incomplete or already-published results', () => {
    expect(publishError({ result: { resultStatus: 'incomplete', publicationStatus: 'draft' }, role: 'admin', settings: locked })).toMatch(/Incomplete/);
    expect(publishError({ result: { resultStatus: 'pass', publicationStatus: 'published' }, role: 'admin', settings: locked })).toMatch(/already/);
    expect(publishError({ result: { resultStatus: 'pass', publicationStatus: 'draft' }, role: 'admin', settings: locked })).toBeNull();
  });
});
