import { StatusBadge } from './ui/index.js';
import { formatMark } from '../utils/format.js';

export function StudentResultsTable({ rows, caption }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left">Code</th>
            <th scope="col" className="px-4 py-2.5 text-left">Course</th>
            <th scope="col" className="px-3 py-2.5 text-center">Credits</th>
            <th scope="col" className="px-3 py-2.5 text-right">Coursework</th>
            <th scope="col" className="px-3 py-2.5 text-right">Exam</th>
            <th scope="col" className="px-3 py-2.5 text-right">Total</th>
            <th scope="col" className="px-3 py-2.5 text-center">Grade</th>
            <th scope="col" className="px-4 py-2.5 text-left">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{r.course.code}</td>
              <td className="px-4 py-2.5">
                {r.course.name}
                {r.publicationStatus === 'corrected' && <span className="ml-2 text-xs text-amber-700">(corrected)</span>}
              </td>
              <td className="px-3 py-2.5 text-center">{r.course.creditUnits}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatMark(r.courseworkMark)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatMark(r.examinationMark)}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMark(r.totalMark)}</td>
              <td className="px-3 py-2.5 text-center font-semibold">{r.grade || '—'}</td>
              <td className="px-4 py-2.5"><StatusBadge status={r.resultStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function groupByPeriod(results) {
  const map = new Map();
  for (const r of results) {
    const key = r.academicPeriod.id;
    if (!map.has(key)) map.set(key, { period: r.academicPeriod, rows: [] });
    map.get(key).rows.push(r);
  }
  return [...map.values()].sort((a, b) => (a.period.startDate < b.period.startDate ? 1 : -1));
}
