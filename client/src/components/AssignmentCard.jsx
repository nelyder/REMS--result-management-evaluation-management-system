import { Link } from 'react-router-dom';
import { ClipboardEdit, Users } from 'lucide-react';
import { Badge } from './ui/index.js';
import { periodLabel } from '../utils/format.js';

export function AssignmentCard({ a }) {
  const pct = a.enrolledCount ? Math.round((a.completeCount / a.enrolledCount) * 100) : 0;
  const base = `/lecturer/courses/${a.courseId}/periods/${a.academicPeriodId}`;
  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-slate-500">{a.course.code}</p>
          <h3 className="mt-0.5 font-semibold text-slate-900">{a.course.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{periodLabel(a.academicPeriod)} · {a.course.creditUnits} credits</p>
        </div>
        {a.academicPeriod?.status === 'active' && <Badge tone="green">Current</Badge>}
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-slate-600">
          <span>Complete results</span>
          <span className="tabular-nums">{a.completeCount}/{a.enrolledCount}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.course.code} completion`}>
          <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.published > 0 && <Badge tone="blue">{a.published} published</Badge>}
          {a.submitted > 0 && <Badge tone="violet">{a.submitted} submitted</Badge>}
          {a.draft > 0 && <Badge>{a.draft} draft</Badge>}
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Link to={`${base}/marks`} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-on-brand hover:bg-brand-800">
          <ClipboardEdit className="h-4 w-4" aria-hidden="true" /> Enter marks
        </Link>
        <Link to={`${base}/students`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Users className="h-4 w-4" aria-hidden="true" /> Students
        </Link>
      </div>
    </article>
  );
}
