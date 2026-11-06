import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, ClipboardEdit, ClipboardList, NotebookPen, Users } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, Spinner, StatCard, StatusBadge } from '../../components/ui/index.js';
import { AssignmentCard } from '../../components/AssignmentCard.jsx';
import { Initials, QuickActions, ResultsProgressCard } from '../../components/DashboardPanels.jsx';
import { assignmentsService, reportsService, resultsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { formatDateTime, formatPercent } from '../../utils/format.js';

export default function LecturerDashboard() {
  const { user } = useAuth();
  const overview = useApi(() => reportsService.overview(), []);
  const current = useApi(() => assignmentsService.mine({ periodStatus: 'active' }), []);
  const recent = useApi(() => resultsService.list({ pageSize: 6, sort: 'updatedAt', order: 'desc' }), []);
  const o = overview.data || {};

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName.split(' ')[0]}`} description="Your teaching load and result progress." />
      {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard label="Assigned courses" value={o.courses} icon={BookOpen} tone="violet" to="/lecturer/courses" actionLabel="View my courses" loading={overview.loading} />
            <StatCard label="Enrolled students" value={o.enrolledStudents} icon={Users} tone="amber" to="/lecturer/courses" actionLabel="View class lists" loading={overview.loading} />
            <StatCard label="Results entered" value={o.resultsEntered} icon={ClipboardList} tone="sky" to="/lecturer/results" actionLabel="View results" loading={overview.loading} hint={o.incompleteResults ? `${o.incompleteResults} incomplete` : undefined} />
            <StatCard label="Published" value={o.publishedResults} icon={CheckCircle2} tone="green" to="/lecturer/results?publicationStatus=published" actionLabel="View published" loading={overview.loading} hint={o.passRate != null ? `${formatPercent(o.passRate)} pass rate` : undefined} />
          </div>

          <Card
            title="Current semester courses"
            actions={<Link to="/lecturer/courses" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">All courses <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
          >
            {current.loading ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : current.error ? (
              <ErrorState message={current.error} onRetry={current.reload} />
            ) : !current.data?.length ? (
              <EmptyState icon={BookOpen} title="No courses this semester" message="Courses assigned to you for the active academic period will appear here." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {current.data.map((a) => <AssignmentCard key={a.id} a={a} />)}
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Quick actions and activity">
          <QuickActions
            actions={[
              { to: '/lecturer/courses', label: 'Enter marks', icon: ClipboardEdit },
              { to: '/lecturer/assignments', label: 'Coursework', icon: NotebookPen },
              { to: '/lecturer/reports', label: 'Course performance', icon: BarChart3, wide: true },
            ]}
          />

          <Card
            title="Recently updated results"
            actions={<Link to="/lecturer/results" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">View all <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
            bodyClassName=""
          >
            {recent.loading ? (
              <Spinner />
            ) : recent.error ? (
              <ErrorState message={recent.error} onRetry={recent.reload} />
            ) : !recent.data?.length ? (
              <p className="p-5 text-sm text-slate-500">No results entered yet.</p>
            ) : (
              <ul className="space-y-1 p-3">
                {recent.data.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
                    <Initials name={r.student.fullName} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium text-slate-900">{r.student.fullName}</span>
                      <span className="block truncate text-xs text-slate-500">
                        <span className="font-mono">{r.course.code}</span>
                        {r.grade ? ` · Grade ${r.grade}` : ''} · {formatDateTime(r.updatedAt)}
                      </span>
                    </span>
                    <StatusBadge status={r.publicationStatus} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ResultsProgressCard overview={overview} description="Students on your courses, all periods" />
        </aside>
      </div>
    </>
  );
}
