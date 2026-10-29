import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardEdit, History } from 'lucide-react';
import { DataTable } from '../../components/DataTable.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { ResultHistoryModal } from '../../components/ResultHistoryModal.jsx';
import { Button, Card, PageHeader, SearchInput, Select, StatusBadge } from '../../components/ui/index.js';
import { assignmentsService, resultsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { useOptions } from '../../hooks/useOptions.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { formatMark, periodLabel } from '../../utils/format.js';

/** Searchable list of results. Admin: all results. Lecturer: results for assigned courses only (enforced by API). */
export default function ResultsBrowserPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { periods, courses: allCourses } = useOptions(isAdmin ? ['periods', 'courses'] : ['periods']);
  const mine = useApi(() => assignmentsService.mine(), [], { enabled: !isAdmin });
  const courseOptions = isAdmin
    ? allCourses
    : [...new Map((mine.data || []).map((a) => [a.courseId, { value: a.courseId, label: `${a.course.code} — ${a.course.name}` }])).values()];

  const q = useListQuery({ pageSize: 25, sort: { key: 'updatedAt', order: 'desc' } });
  const list = useApi(() => resultsService.list(q.params), [JSON.stringify(q.params)]);
  const [historyFor, setHistoryFor] = useState(null);
  const base = isAdmin ? '/admin' : '/lecturer';

  return (
    <>
      <PageHeader
        title={isAdmin ? 'All results' : 'Results'}
        description={isAdmin ? 'Search results across the institution.' : 'Search results for the courses assigned to you.'}
      />
      <Card bodyClassName="">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={q.search} onChange={q.setSearch} placeholder="Name or reg. number…" className="lg:col-span-2" />
          <Select aria-label="Course" value={q.filters.courseId ?? ''} onChange={(e) => q.setFilter('courseId', e.target.value)} options={courseOptions} placeholder="All courses" />
          <Select aria-label="Academic period" value={q.filters.academicPeriodId ?? ''} onChange={(e) => q.setFilter('academicPeriodId', e.target.value)} options={periods} placeholder="All periods" />
          <Select
            aria-label="Publication status"
            value={q.filters.publicationStatus ?? ''}
            onChange={(e) => q.setFilter('publicationStatus', e.target.value)}
            placeholder="Any status"
            options={['draft', 'submitted', 'published', 'corrected'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
          />
        </div>
        <DataTable
          caption="Results"
          sort={q.sort}
          onSort={q.setSort}
          columns={[
            {
              key: 'student',
              header: 'Student',
              render: (r) => (
                <div>
                  <p className="font-medium text-slate-900">{r.student.fullName}</p>
                  <p className="font-mono text-xs text-slate-500">{r.student.registrationNumber}</p>
                </div>
              ),
            },
            {
              key: 'course',
              header: 'Course',
              render: (r) => (
                <div>
                  <p className="text-slate-900">{r.course.code}</p>
                  <p className="text-xs text-slate-500">{periodLabel(r.academicPeriod)}</p>
                </div>
              ),
            },
            { key: 'courseworkMark', header: 'CW', align: 'right', render: (r) => formatMark(r.courseworkMark) },
            { key: 'examinationMark', header: 'Exam', align: 'right', render: (r) => formatMark(r.examinationMark) },
            { key: 'totalMark', header: 'Total', sortable: true, align: 'right', render: (r) => <span className="font-semibold">{formatMark(r.totalMark)}</span> },
            { key: 'grade', header: 'Grade', align: 'center', render: (r) => r.grade || '—' },
            { key: 'resultStatus', header: 'Result', render: (r) => <StatusBadge status={r.resultStatus} /> },
            { key: 'publicationStatus', header: 'Status', render: (r) => <StatusBadge status={r.publicationStatus} /> },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1">
                  <Link
                    to={`${base}/courses/${r.course.id}/periods/${r.academicPeriod.id}/marks`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                    aria-label={`Open marks entry for ${r.course.code}`}
                    title="Open marks entry"
                  >
                    <ClipboardEdit className="h-4 w-4" />
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => setHistoryFor(r)} aria-label="View history" title="History">
                    <History className="h-4 w-4" />
                  </Button>
                </div>
              ),
            },
          ]}
          rows={list.data || []}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No results found"
          emptyMessage="Adjust your filters or enter marks from a course page."
          footer={<Pagination page={q.page} pageSize={q.pageSize} total={list.meta?.total || 0} onPageChange={q.setPage} />}
        />
      </Card>
      {historyFor && <ResultHistoryModal result={historyFor} studentName={historyFor.student.fullName} onClose={() => setHistoryFor(null)} />}
    </>
  );
}
