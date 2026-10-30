import { describe, expect, it } from 'vitest';
import { previewResult, validateMark } from '../src/utils/evaluation.js';
import { toCsv } from '../src/utils/csv.js';
import { validateBands } from '../src/pages/admin/GradingPage.jsx';

const scales = [
  { grade: 'A', minimumMark: 70, maximumMark: 100 },
  { grade: 'B', minimumMark: 60, maximumMark: 69.99 },
  { grade: 'C', minimumMark: 50, maximumMark: 59.99 },
  { grade: 'F', minimumMark: 0, maximumMark: 49.99 },
];
const config = { courseworkMax: 40, examMax: 60, passMark: 50, scales };

describe('previewResult', () => {
  it('computes total, grade and pass', () => {
    expect(previewResult({ coursework: '30', exam: '45' }, config)).toMatchObject({ total: 75, grade: 'A', status: 'pass' });
  });
  it('marks fail below pass mark', () => {
    expect(previewResult({ coursework: '20', exam: '29.5' }, config)).toMatchObject({ total: 49.5, grade: 'F', status: 'fail' });
  });
  it('treats a missing mark as incomplete, not zero', () => {
    expect(previewResult({ coursework: '35', exam: '' }, config)).toMatchObject({ total: null, grade: null, status: 'incomplete' });
  });
  it('rejects marks above the component maximum', () => {
    expect(previewResult({ coursework: '41', exam: '10' }, config).errors.coursework).toMatch(/exceed 40/);
  });
});

describe('validateMark', () => {
  it('accepts 2-decimal marks that are inexact in floating point', () => {
    for (const v of ['1.1', '0.29', '0.07', '12.07', '33.33']) expect(validateMark(v, 40, 'Coursework')).toBeNull();
    expect(validateMark('1.005', 40, 'Coursework')).toMatch(/2 decimal/);
  });
  it('rejects negatives and more than 2 decimals', () => {
    expect(validateMark('-1', 40, 'CW')).toMatch(/negative/);
    expect(validateMark('10.123', 40, 'CW')).toMatch(/2 decimal/);
    expect(validateMark('10.25', 40, 'CW')).toBeNull();
  });
});

describe('validateBands', () => {
  it('accepts a contiguous 0–100 scale', () => {
    expect(validateBands(scales)).toBeNull();
  });
  it('detects overlaps and gaps', () => {
    expect(validateBands([{ ...scales[0], minimumMark: 65 }, ...scales.slice(1)])).toMatch(/overlap/);
    expect(validateBands([scales[0], scales[2], scales[3]])).toMatch(/gap/);
  });
});

describe('toCsv', () => {
  it('escapes quotes, commas and formula injection', () => {
    const csv = toCsv([{ a: 'x,"y"', b: '=SUM(A1)' }], [
      { header: 'A', value: (r) => r.a },
      { header: 'B', value: (r) => r.b },
    ]);
    expect(csv).toBe('A,B\r\n"x,""y""",\'=SUM(A1)');
  });
});
