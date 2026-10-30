import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, CheckCircle2, TrendingUp } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '../../components/ui/index.js';
import { StudentResultsTable, groupByPeriod } from '../../components/StudentResultsTable.jsx';
import { AssignmentListItem } from './AssignmentsPage.jsx';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { formatMark, periodLabel } from '../../utils/format.js';

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
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses with results" value={c.courses} icon={BookOpen} loading={summary.loading} />
        <StatCard label="Credits earned" value={c.creditsAttempted != null ? `${c.creditsEarned}/${c.creditsAttempted}` : undefined} icon={CheckCircle2} tone="green" loading={summary.loading} />
        <StatCard label="Weighted average" value={c.average != null ? formatMark(c.average) : undefined} icon={TrendingUp} tone="violet" loading={summary.loading} />
        <StatCard label="CGPA" value={c.gpa} icon={Award} tone="amber" loading={summary.loading} />
      </div>
      <Card
        title="Upcoming assignments"
        className="mb-6"
        actions={<Link to="/student/assignments" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">All assignments <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
        bodyClassName=""
      >
        {assignments.loading ? (
          <Spinner label="Loading assignments" />
        ) : assignments.error ? (
          <ErrorState message={assignments.error} onRetry={assignments.reload} />
        ) : !upcoming.length ? (
          <p className="p-5 text-sm text-slate-500">No assignments are due. New ones appear here when a lecturer assigns them to you.</p>
        ) : (
          <ul className="divide-y divide-slate-100">{upcoming.map((a) => <AssignmentListItem key={a.id} a={a} />)}</ul>
        )}
      </Card>
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
    </>
  );
}
