import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, ClipboardList, Users } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui/index.js';
import { AssignmentCard } from '../../components/AssignmentCard.jsx';
import { assignmentsService, reportsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { formatPercent } from '../../utils/format.js';

export default function LecturerDashboard() {
  const { user } = useAuth();
  const overview = useApi(() => reportsService.overview(), []);
  const current = useApi(() => assignmentsService.mine({ periodStatus: 'active' }), []);
  const o = overview.data || {};

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName.split(' ')[0]}`} description="Your teaching load and result progress." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned courses" value={o.courses} icon={BookOpen} loading={overview.loading} />
        <StatCard label="Enrolled students" value={o.enrolledStudents} icon={Users} tone="violet" loading={overview.loading} />
        <StatCard label="Results entered" value={o.resultsEntered} icon={ClipboardList} tone="amber" loading={overview.loading} hint={o.incompleteResults ? `${o.incompleteResults} incomplete` : undefined} />
        <StatCard label="Published" value={o.publishedResults} icon={CheckCircle2} tone="green" loading={overview.loading} hint={o.passRate != null ? `${formatPercent(o.passRate)} pass rate` : undefined} />
      </div>

      <Card
        title="Current semester courses"
        actions={<Link to="/lecturer/courses" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">All courses <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
      >
        {current.loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : current.error ? (
          <ErrorState message={current.error} onRetry={current.reload} />
        ) : !current.data?.length ? (
          <EmptyState icon={BookOpen} title="No courses this semester" message="Courses assigned to you for the active academic period will appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {current.data.map((a) => <AssignmentCard key={a.id} a={a} />)}
          </div>
        )}
      </Card>
    </>
  );
}
