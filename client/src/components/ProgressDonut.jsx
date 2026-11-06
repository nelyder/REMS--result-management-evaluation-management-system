import { useState } from 'react';
import { EmptyState } from './ui/index.js';

const R = 40;
const C = 2 * Math.PI * R;
const GAP = 1.5; // surface gap between segments, in viewBox units

/**
 * Part-to-whole donut with a legend table (label, count, %), so it reads without colour.
 * `segments`: [{ key, label, value, color }] where color is a CSS colour (use the series tokens).
 */
export function ProgressDonut({ segments, totalLabel = 'Total', caption }) {
  const [active, setActive] = useState(null);
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState title="Nothing to show yet" />;

  const pct = (v) => `${Math.round((v / total) * 100)}%`;
  const visible = segments.filter((d) => d.value > 0);
  let offset = 0;
  const arcs = visible.map((d) => {
    const len = (d.value / total) * C;
    const arc = { ...d, dash: Math.max(len - (visible.length > 1 ? GAP : 0), 0.5), offset };
    offset += len;
    return arc;
  });
  const focus = segments.find((d) => d.key === active);

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-48">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="14" className="stroke-slate-100" />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={active === a.key ? 16 : 14}
              strokeDasharray={`${a.dash} ${C - a.dash}`}
              strokeDashoffset={-a.offset}
              opacity={active && active !== a.key ? 0.35 : 1}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setActive(a.key)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-live="polite">
          <span className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{focus ? focus.value : total}</span>
          <span className="text-xs text-slate-500">{focus ? `${focus.label} · ${pct(focus.value)}` : totalLabel}</span>
        </div>
      </div>

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only">
          <tr><th scope="col">Status</th><th scope="col">Count</th><th scope="col">Share</th></tr>
        </thead>
        <tbody>
          {segments.map((d) => (
            <tr
              key={d.key}
              tabIndex={0}
              className={`cursor-default rounded outline-offset-0 ${active === d.key ? 'bg-slate-50' : ''}`}
              onMouseEnter={() => setActive(d.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
            >
              <th scope="row" className="py-1.5 pl-1 text-left font-normal text-slate-700">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded" style={{ backgroundColor: d.color }} aria-hidden="true" />
                  {d.label}
                </span>
              </th>
              <td className="py-1.5 text-right tabular-nums text-slate-900">{d.value}</td>
              <td className="w-14 py-1.5 pr-1 text-right tabular-nums text-slate-500">{pct(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
