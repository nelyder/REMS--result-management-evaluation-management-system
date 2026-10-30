import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button.jsx';

export function Spinner({ label = 'Loading', className = '' }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-2 py-10 text-slate-500 ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />;
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3">
        <Icon className="h-6 w-6 text-slate-500" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <AlertTriangle className="mb-2 h-6 w-6 text-red-600" aria-hidden="true" />
      <p className="text-sm text-slate-700">{message || 'Unable to load data.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const badgeTones = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function Badge({ tone = 'gray', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

const statusTones = {
  pass: 'green',
  fail: 'red',
  incomplete: 'amber',
  draft: 'gray',
  submitted: 'violet',
  published: 'blue',
  corrected: 'amber',
  active: 'green',
  inactive: 'gray',
  suspended: 'red',
  planned: 'gray',
  closed: 'gray',
  enrolled: 'blue',
  withdrawn: 'gray',
  completed: 'green',
};

export function StatusBadge({ status }) {
  if (!status) return <Badge>—</Badge>;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge tone={statusTones[status] || 'gray'}>{label}</Badge>;
}
