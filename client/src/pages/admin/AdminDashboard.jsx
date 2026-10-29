import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ClipboardCheck, GraduationCap, Users } from 'lucide-react';
import { Badge, Card, ErrorState, PageHeader, Spinner, StatCard } from '../../components/ui/index.js';
import { GradeDistribution } from '../../components/GradeDistribution.jsx';
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
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={o.students} icon={GraduationCap} loading={overview.loading} hint={o.activeStudents != null ? `${o.activeStudents} active` : undefined} />
        <StatCard label="Lecturers" value={o.lecturers} icon={Users} tone="violet" loading={overview.loading} />
        <StatCard label="Courses" value={o.courses} icon={BookOpen} tone="amber" loading={overview.loading} />
        <StatCard
          label="Published results"
          value={o.publishedResults}
          icon={ClipboardCheck}
          tone="green"
          loading={overview.loading}
          hint={o.passRate != null ? `${formatPercent(o.passRate)} pass rate` : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title="Awaiting publication"
          description="Courses with unpublished results"
          className="xl:col-span-2"
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

        <Card
          title="Recent activity"
          className="xl:col-span-3"
          actions={<Link to="/admin/audit-logs" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">View all <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
          bodyClassName=""
        >
          {audit.loading ? (
            <Spinner />
          ) : !audit.data?.length ? (
            <p className="p-5 text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {audit.data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-medium text-slate-900">{a.actor?.fullName || 'System'}</span>{' '}
                    <span className="text-slate-600">{a.action.toLowerCase().replace('_', ' ')} · {titleCase(a.entityType)}</span>
                  </span>
                  <span className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
