import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ClipboardCheck, GraduationCap, Plus, Send, UserPlus, Users } from 'lucide-react';
import { Badge, Card, ErrorState, PageHeader, Spinner, StatCard } from '../../components/ui/index.js';
import { GradeDistribution } from '../../components/GradeDistribution.jsx';
import { Initials, QuickActions, ResultsProgressCard } from '../../components/DashboardPanels.jsx';
import { auditService, reportsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { formatDateTime, formatPercent, periodLabel, titleCase } from '../../utils/format.js';

export default function AdminDashboard() {
  const { user } = useAuth();
  const overview = useApi(() => reportsService.overview(), []);
  const pending = useApi(() => reportsService.coursePerformance({ pageSize: 6, pendingOnly: true }), []);
  const dist = useApi(() => reportsService.gradeDistribution(), []);
  const audit = useApi(() => auditService.list({ pageSize: 6 }), []);
  const o = overview.data || {};

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName.split(' ')[0]}`} description="Institution-wide overview of students, staff and results." />
      {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard label="Students" value={o.students} icon={GraduationCap} tone="violet" to="/admin/students" actionLabel="Manage students" loading={overview.loading} hint={o.activeStudents != null ? `${o.activeStudents} active` : undefined} />
            <StatCard label="Lecturers" value={o.lecturers} icon={Users} tone="amber" to="/admin/lecturers" actionLabel="Manage lecturers" loading={overview.loading} />
            <StatCard label="Courses" value={o.courses} icon={BookOpen} tone="sky" to="/admin/courses" actionLabel="Manage courses" loading={overview.loading} />
            <StatCard
              label="Published results"
              value={o.publishedResults}
              icon={ClipboardCheck}
              tone="green"
              to="/admin/results?publicationStatus=published"
              actionLabel="View published"
              loading={overview.loading}
              hint={o.passRate != null ? `${formatPercent(o.passRate)} pass rate` : undefined}
            />
          </div>

          <Card
            title="Awaiting publication"
            description="Courses with unpublished results"
            actions={<Link to="/admin/publication" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">Manage <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
            bodyClassName=""
          >
            {pending.loading ? (
              <Spinner />
            ) : pending.error ? (
              <ErrorState message={pending.error} onRetry={pending.reload} />
            ) : !pending.data?.length ? (
              <p className="p-5 text-sm text-slate-500">Nothing is waiting for publication.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.data.map((r) => (
                  <li key={`${r.courseId}-${r.academicPeriodId}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.courseCode} — {r.courseName}</p>
                      <p className="text-xs text-slate-500">{periodLabel(r.academicPeriod)} · {r.lecturerName || 'Unassigned'}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {r.submitted > 0 && <Badge tone="violet">{r.submitted} submitted</Badge>}
                      {r.draft > 0 && <Badge>{r.draft} draft</Badge>}
                      {r.incomplete > 0 && <Badge tone="amber">{r.incomplete} missing marks</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Grade distribution" description="Published results, all periods">
            {dist.loading ? <Spinner /> : <GradeDistribution data={dist.data || []} />}
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Quick actions and activity">
          <QuickActions
            actions={[
              { to: '/admin/students?new=1', label: 'Add student', icon: Plus },
              { to: '/admin/lecturers?new=1', label: 'Add lecturer', icon: UserPlus },
              { to: '/admin/publication', label: 'Publish results', icon: Send, wide: true },
            ]}
          />

          <Card
            title="Recent activity"
            actions={<Link to="/admin/audit-logs" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">View all <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
            bodyClassName=""
          >
            {audit.loading ? (
              <Spinner />
            ) : !audit.data?.length ? (
              <p className="p-5 text-sm text-slate-500">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-1 p-3">
                {audit.data.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
                    <Initials name={a.actor?.fullName || 'System'} />
                    <span className="min-w-0 text-sm">
                      <span className="block truncate">
                        <span className="font-medium text-slate-900">{a.actor?.fullName || 'System'}</span>{' '}
                        <span className="text-slate-600">{a.action.toLowerCase().replace('_', ' ')} · {titleCase(a.entityType)}</span>
                      </span>
                      <span className="block text-xs text-slate-500">{formatDateTime(a.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ResultsProgressCard overview={overview} description="Enrolled students, all periods" />
        </aside>
      </div>
    </>
  );
}
