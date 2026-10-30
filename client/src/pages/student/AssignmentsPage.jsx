import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, NotebookPen } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui/index.js';
import { DueBadge } from '../../components/DueBadge.jsx';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { formatDateTime, formatMark, periodLabel } from '../../utils/format.js';

export function AssignmentListItem({ a }) {
  return (
    <li>
      <Link
        to={`/student/assignments/${a.id}`}
        className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{a.title}</p>
          <p className="text-xs text-slate-500">
            <span className="font-mono">{a.course.code}</span> — {a.course.name} · {periodLabel(a.academicPeriod)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Due</span> {formatDateTime(a.dueAt)}
          </span>
          <DueBadge dueAt={a.dueAt} />
          <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </div>
      </Link>
    </li>
  );
}

/** Assignments the signed-in student has been assigned (the API returns only those). */
export default function StudentAssignmentsPage() {
  const list = useApi(() => studentsService.myAssignments(), []);
  const all = list.data || [];
  const now = Date.now();
  const open = all.filter((a) => new Date(a.dueAt).getTime() >= now);
  const past = all.filter((a) => new Date(a.dueAt).getTime() < now).reverse();

  return (
    <>
      <PageHeader title="Assignments" description="Coursework your lecturers have assigned to you." />
      {list.loading ? (
        <Spinner label="Loading assignments" />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !all.length ? (
        <Card>
          <EmptyState icon={NotebookPen} title="No assignments" message="Assignments appear here when a lecturer assigns them to you." />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card title={`Open (${open.length})`} description="Sorted by due date" bodyClassName="">
            {open.length ? (
              <ul className="divide-y divide-slate-100">{open.map((a) => <AssignmentListItem key={a.id} a={a} />)}</ul>
            ) : (
              <p className="p-5 text-sm text-slate-500">Nothing is due. Well done.</p>
            )}
          </Card>
          {past.length > 0 && (
            <Card title={`Past due (${past.length})`} bodyClassName="">
              <ul className="divide-y divide-slate-100">{past.map((a) => <AssignmentListItem key={a.id} a={a} />)}</ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export function AssignmentFacts({ a }) {
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Due</dt>
        <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-slate-900">{formatDateTime(a.dueAt)} <DueBadge dueAt={a.dueAt} /></dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Maximum marks</dt>
        <dd className="mt-0.5 text-slate-900">{formatMark(a.maxMarks)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Assigned</dt>
        <dd className="mt-0.5 text-slate-900">{formatDateTime(a.assignedAt)}</dd>
      </div>
    </dl>
  );
}
