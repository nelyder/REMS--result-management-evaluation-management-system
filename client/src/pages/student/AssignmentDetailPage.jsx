import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui/index.js';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { periodLabel } from '../../utils/format.js';
import { AssignmentFacts } from './AssignmentsPage.jsx';

export default function StudentAssignmentDetailPage() {
  const { id } = useParams();
  const item = useApi(() => studentsService.myAssignment(id), [id]);
  const a = item.data;

  const back = (
    <Link to="/student/assignments" className="inline-flex items-center gap-1 hover:text-brand-700">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Assignments
    </Link>
  );

  if (item.loading) return <Spinner label="Loading assignment" />;
  if (item.error) {
    return (
      <>
        <PageHeader breadcrumb={back} title="Assignment" />
        <Card>
          {/* 404 also covers assignments the student was removed from: no access, no details. */}
          {item.errorStatus === 404 ? (
            <EmptyState icon={Lock} title="This assignment is not available" message="It may have been removed, or you are no longer assigned to it." />
          ) : (
            <ErrorState message={item.error} onRetry={item.reload} />
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader breadcrumb={back} title={a.title} description={`${a.course.code} — ${a.course.name} · ${periodLabel(a.academicPeriod)}`} />
      <Card>
        <AssignmentFacts a={a} />
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Instructions</h2>
          {a.description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{a.description}</p>
          ) : (
            <p className="text-sm text-slate-500">No instructions were added. Ask your lecturer if anything is unclear.</p>
          )}
        </div>
      </Card>
    </>
  );
}
