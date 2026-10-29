import { EmptyState } from './ui/index.js';

/** Horizontal bars with explicit counts and percentages (readable without colour). */
export function GradeDistribution({ data = [] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <EmptyState title="No published grades yet" />;
  const max = Math.max(...data.map((d) => d.count));
  return (
    <ul className="space-y-2.5" aria-label="Grade distribution">
      {data.map((d) => (
        <li key={d.grade} className="grid grid-cols-[2.5rem_1fr_5.5rem] items-center gap-3 text-sm">
          <span className="font-semibold text-slate-800">{d.grade}</span>
          <div className="h-5 rounded bg-slate-100">
            <div
              className={`h-5 rounded ${d.grade === 'F' ? 'bg-red-400' : 'bg-brand-600'}`}
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="text-right tabular-nums text-slate-600">
            {d.count} <span className="text-xs text-slate-400">({((d.count / total) * 100).toFixed(0)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
