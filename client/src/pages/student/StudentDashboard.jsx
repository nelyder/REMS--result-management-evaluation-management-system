import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, CheckCircle2, ClipboardList, FileText, TrendingUp } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '../../components/ui/index.js';
import { StudentResultsTable, groupByPeriod } from '../../components/StudentResultsTable.jsx';
import { GradeDistribution } from '../../components/GradeDistribution.jsx';
import { DueBadge } from '../../components/DueBadge.jsx';
import { QuickActions } from '../../components/DashboardPanels.jsx';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { formatDateTime, formatMark, periodLabel } from '../../utils/format.js';

/** Counts of the student's own published grades, best grade first. */
function gradeCounts(results = []) {
  const byGrade = new Map();
  for (const r of results) {
    if (!r.grade) continue;
    const g = byGrade.get(r.grade) ?? { grade: r.grade, count: 0, point: r.gradePoint ?? -1 };
    g.count += 1;
    byGrade.set(r.grade, g);
  }
  return [...byGrade.values()].sort((a, b) => b.point - a.point || a.grade.localeCompare(b.grade));
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const summary = useApi(() => studentsService.mySummary(), []);
  const results = useApi(() => studentsService.myResults(), []);
  const assignments = useApi(() => studentsService.myAssignments(), []);
  const upcoming = (assignments.data || []).filter((a) => new Date(a.dueAt).getTime() >= Date.now()).slice(0, 5);
  const c = summary.data?.cumulative || {};
  const latest = results.data ? groupByPeriod(results.data)[0] : null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName.split(' ')[0]}`}
        description={user.student ? `${user.student.registrationNumber} · ${user.student.programme?.name ?? ''} · Year ${user.student.yearOfStudy}` : undefined}
      />
      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard label="Courses with results" value={c.courses} icon={BookOpen} tone="violet" to="/student/results" actionLabel="View results" loading={summary.loading} hint={c.courses ? `${c.passCount} passed · ${c.failCount} failed` : undefined} />
            <StatCard label="Credits earned" value={c.creditsAttempted != null ? `${c.creditsEarned}/${c.creditsAttempted}` : undefined} icon={CheckCircle2} tone="amber" to="/student/statement" actionLabel="View statement" loading={summary.loading} />
            <StatCard label="Weighted average" value={c.average != null ? formatMark(c.average) : undefined} icon={TrendingUp} tone="sky" to="/student/performance" actionLabel="View performance" loading={summary.loading} />
            <StatCard label="CGPA" value={c.gpa} icon={Award} tone="green" to="/student/performance" actionLabel="View by semester" loading={summary.loading} />
          </div>

          <Card
            title={latest ? `Latest results — ${periodLabel(latest.period)}` : 'Latest results'}
            actions={<Link to="/student/results" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">All results <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
            bodyClassName=""
          >
            {results.loading ? (
              <Spinner />
            ) : results.error ? (
              <ErrorState message={results.error} onRetry={results.reload} />
            ) : !latest ? (
              <EmptyState title="No published results yet" message="Your results will appear here once they are published by your department." />
            ) : (
              <StudentResultsTable rows={latest.rows} caption={`Results for ${periodLabel(latest.period)}`} />
            )}
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Quick actions and coursework">
          <QuickActions
            actions={[
              { to: '/student/results', label: 'My results', icon: ClipboardList },
              { to: '/student/statement', label: 'Statement', icon: FileText },
              { to: '/student/performance', label: 'Academic performance', icon: TrendingUp, wide: true },
            ]}
          />

          <Card
            title="Upcoming assignments"
            actions={<Link to="/student/assignments" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">View all <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
            bodyClassName=""
          >
            {assignments.loading ? (
              <Spinner label="Loading assignments" />
            ) : assignments.error ? (
              <ErrorState message={assignments.error} onRetry={assignments.reload} />
            ) : !upcoming.length ? (
              <p className="p-5 text-sm text-slate-500">No assignments are due. New ones appear here when a lecturer assigns them to you.</p>
            ) : (
              <ul className="space-y-1 p-3">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <Link to={`/student/assignments/${a.id}`} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-medium text-slate-900">{a.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          <span className="font-mono">{a.course.code}</span> · <span className="sr-only">Due </span>{formatDateTime(a.dueAt)}
                        </span>
                      </span>
                      <DueBadge dueAt={a.dueAt} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="My grades" description="Published results, all semesters">
            {results.loading ? <Spinner /> : <GradeDistribution data={gradeCounts(results.data)} />}
          </Card>
        </aside>
      </div>
    </>
  );
}
