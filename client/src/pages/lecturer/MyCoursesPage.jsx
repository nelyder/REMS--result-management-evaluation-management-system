import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, Select, Skeleton } from '../../components/ui/index.js';
import { AssignmentCard } from '../../components/AssignmentCard.jsx';
import { assignmentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useOptions } from '../../hooks/useOptions.js';

export default function MyCoursesPage() {
  const { periods } = useOptions(['periods']);
  const [periodId, setPeriodId] = useState('');
  const list = useApi(() => assignmentsService.mine(periodId ? { academicPeriodId: periodId } : {}), [periodId]);

  return (
    <>
      <PageHeader
        title="My courses"
        description="Courses assigned to you. You can only view and manage results for these courses."
        actions={
          <Select aria-label="Academic period" value={periodId} onChange={(e) => setPeriodId(e.target.value)} options={periods} placeholder="All periods" className="w-60" />
        }
      />
      {list.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState icon={BookOpen} title="No assigned courses" message="Ask an administrator to assign you to courses." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((a) => <AssignmentCard key={a.id} a={a} />)}
        </div>
      )}
    </>
  );
}
