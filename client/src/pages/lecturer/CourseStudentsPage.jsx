import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardEdit } from 'lucide-react';
import { DataTable } from '../../components/DataTable.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { Card, PageHeader, SearchInput, StatusBadge } from '../../components/ui/index.js';
import { enrollmentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { formatMark, periodLabel } from '../../utils/format.js';

export default function CourseStudentsPage() {
  const { courseId, periodId } = useParams();
  const q = useListQuery({ pageSize: 25, sort: { key: 'registrationNumber', order: 'asc' } });
  const list = useApi(
    () => enrollmentsService.forCourse(courseId, { ...q.params, academicPeriodId: periodId }),
    [courseId, periodId, JSON.stringify(q.params)],
  );
  const meta = list.meta || {};

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/lecturer/courses" className="inline-flex items-center gap-1 hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My courses
          </Link>
        }
        title={meta.course ? `${meta.course.code} — Class list` : 'Class list'}
        description={meta.course ? `${meta.course.name} · ${periodLabel(meta.academicPeriod)}` : undefined}
        actions={
          <Link
            to={`/lecturer/courses/${courseId}/periods/${periodId}/marks`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
          >
            <ClipboardEdit className="h-4 w-4" aria-hidden="true" /> Enter marks
          </Link>
        }
      />
      <Card bodyClassName="">
        <div className="border-b border-slate-200 p-4">
          <SearchInput value={q.search} onChange={q.setSearch} placeholder="Search by name or registration number…" className="sm:max-w-sm" />
        </div>
        <DataTable
          caption="Students enrolled on this course"
          sort={q.sort}
          onSort={q.setSort}
          columns={[
            { key: 'registrationNumber', header: 'Reg. number', sortable: true, className: 'font-mono text-xs', render: (r) => r.student.registrationNumber },
            { key: 'fullName', header: 'Name', sortable: true, render: (r) => r.student.fullName },
            { key: 'programme', header: 'Programme', render: (r) => r.student.programme?.code || '—' },
            { key: 'year', header: 'Year', align: 'center', render: (r) => r.student.yearOfStudy },
            { key: 'enrollmentStatus', header: 'Enrollment', render: (r) => <StatusBadge status={r.enrollmentStatus} /> },
            { key: 'total', header: 'Total', align: 'right', render: (r) => formatMark(r.result?.totalMark) },
            { key: 'grade', header: 'Grade', align: 'center', render: (r) => r.result?.grade || '—' },
            { key: 'status', header: 'Result', render: (r) => <StatusBadge status={r.result?.publicationStatus || null} /> },
          ]}
          rows={list.data || []}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No students enrolled"
          footer={<Pagination page={q.page} pageSize={q.pageSize} total={meta.total || 0} onPageChange={q.setPage} />}
        />
      </Card>
    </>
  );
}
