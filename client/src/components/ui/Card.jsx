import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from './Feedback.jsx';

export function Card({ id, title, description, actions, children, className = '', bodyClassName = 'p-5' }) {
  return (
    <section id={id} className={`scroll-mt-6 rounded-xl border border-slate-200 bg-surface shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const statTones = {
  blue: 'bg-tile-lavender',
  violet: 'bg-tile-pink',
  amber: 'bg-tile-amber',
  sky: 'bg-tile-sky',
  green: 'bg-tile-mint',
  red: 'bg-tile-rose',
};

/** Pastel KPI tile. Pass `to` (route) to render it as a link, or `onClick` to render it as a button. */
export function StatCard({ label, value, icon: Icon, tone = 'blue', hint, loading, to, onClick, actionLabel = 'View details' }) {
  const interactive = Boolean(to || onClick);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {Icon && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface/80 text-slate-700 shadow-sm">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-9 w-24" />
      ) : (
        <p className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value ?? '—'}</p>
      )}
      {(hint || interactive) && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs">
          <span className="text-slate-700">{hint}</span>
          {interactive && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface/80 px-2 py-1 font-medium text-brand-700 shadow-sm">
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </>
  );

  const base = `flex min-h-36 flex-col rounded-2xl p-4 ${statTones[tone] ?? statTones.blue}`;
  if (!interactive) return <div className={base}>{body}</div>;

  const interactiveClass = `group w-full text-left transition hover:-translate-y-0.5 hover:shadow-md ${base}`;
  return to ? (
    <Link to={to} className={interactiveClass}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={interactiveClass}>{body}</button>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb && <div className="mb-1 text-xs text-slate-500">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
