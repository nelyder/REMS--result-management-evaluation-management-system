// Right-hand column pieces shared by the admin and lecturer dashboards.
import { Link } from 'react-router-dom';
import { Card, Spinner } from './ui/index.js';
import { ProgressDonut } from './ProgressDonut.jsx';

const actionBase = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors';

/** Grid of shortcut links; the first is highlighted, `wide` ones span both columns. */
export function QuickActions({ actions }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm" aria-label="Quick actions">
      <div className="grid grid-cols-2 gap-3">
        {actions.map(({ to, label, icon: Icon, wide }, i) => (
          <Link
            key={to}
            to={to}
            className={`${actionBase} ${wide ? 'col-span-2' : ''} ${
              i === 0 ? 'bg-tile-pink text-slate-900 hover:brightness-95' : 'border border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
          >
            {label} <Icon className="h-4 w-4" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Initials({ name }) {
  const text = (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  return (
    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[0.65rem] font-semibold text-brand-800" aria-hidden="true">
      {text}
    </span>
  );
}

/** Donut of where enrolled students' results stand: published / ready to publish / missing marks. */
export function ResultsProgressCard({ overview, description }) {
  const o = overview.data || {};
  return (
    <Card title="Results progress" description={description}>
      {overview.loading ? (
        <Spinner />
      ) : (
        <ProgressDonut
          caption="Results progress across all enrolments"
          totalLabel="Enrolled students"
          segments={[
            { key: 'published', label: 'Published', value: o.publishedResults ?? 0, color: 'var(--color-series-1)' },
            { key: 'ready', label: 'Ready to publish', value: o.readyToPublish ?? 0, color: 'var(--color-series-2)' },
            { key: 'incomplete', label: 'Missing marks', value: o.incompleteResults ?? 0, color: 'var(--color-series-3)' },
          ]}
        />
      )}
    </Card>
  );
}
