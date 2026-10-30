import { useMemo, useState } from 'react';
import { NotebookPen, Plus, Trash2, Users } from 'lucide-react';
import { DataTable } from '../../components/DataTable.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { AssignmentDialog } from '../../components/AssignmentDialog.jsx';
import { DueBadge } from '../../components/DueBadge.jsx';
import { Badge, Button, Card, ConfirmDialog, PageHeader, SearchInput, Select } from '../../components/ui/index.js';
import { assignmentsService, courseworkService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { useOptions } from '../../hooks/useOptions.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { formatDateTime, formatMark, periodLabel } from '../../utils/format.js';

/**
 * Course offerings the user can add assignments to. Lecturers: their course assignments
 * (the API enforces the same rule). Admins: any course in any period.
 */
function useOfferings(isAdmin) {
  const { courses, periods } = useOptions(isAdmin ? ['courses', 'periods'] : []);
  const mine = useApi(() => assignmentsService.mine(), [], { enabled: !isAdmin });
  return useMemo(() => {
    if (isAdmin) {
      const all = periods.map((p) => p.raw);
      return { courses, periods, periodsFor: () => all };
    }
    const rows = mine.data || [];
    const courseOptions = [...new Map(rows.map((a) => [a.courseId, { value: a.courseId, label: `${a.course.code} — ${a.course.name}` }])).values()];
    const periodOptions = [...new Map(rows.map((a) => [a.academicPeriodId, { value: a.academicPeriodId, label: periodLabel(a.academicPeriod) }])).values()];
    return {
      courses: courseOptions,
      periods: periodOptions,
      periodsFor: (courseId) => rows.filter((a) => a.courseId === courseId).map((a) => a.academicPeriod),
    };
  }, [isAdmin, courses, periods, mine.data]);
}

export default function CourseworkPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const offerings = useOfferings(isAdmin);
  const q = useListQuery({ pageSize: 20 });
  const list = useApi(() => courseworkService.list(q.params), [JSON.stringify(q.params)]);

  const [dialog, setDialog] = useState(null); // { mode, assignment }
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const onSaved = () => {
    setDialog(null);
    list.reload();
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await courseworkService.remove(toDelete.id);
      toast.success('Assignment deleted.');
      setToDelete(null);
      list.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Coursework assignments' : 'Assignments'}
        description={
          isAdmin
            ? 'Coursework assignments across all courses, and which students can see each one.'
            : 'Create coursework for your courses and choose exactly which enrolled students can see it.'
        }
        actions={<Button icon={Plus} onClick={() => setDialog({ mode: 'create' })}>Add assignment</Button>}
      />
      <Card bodyClassName="">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={q.search} onChange={q.setSearch} placeholder="Search title or course…" className="lg:col-span-2" />
          <Select aria-label="Course" value={q.filters.courseId ?? ''} onChange={(e) => q.setFilter('courseId', e.target.value)} options={offerings.courses} placeholder="All courses" />
          <Select
            aria-label="Academic period"
            value={q.filters.academicPeriodId ?? ''}
            onChange={(e) => q.setFilter('academicPeriodId', e.target.value)}
            options={offerings.periods}
            placeholder="All periods"
          />
        </div>
        <DataTable
          caption="Coursework assignments"
          sort={q.sort}
          onSort={q.setSort}
          columns={[
            {
              key: 'title',
              header: 'Assignment',
              sortable: true,
              render: (a) => (
                <div className="min-w-48">
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{a.course.code}</span> · {periodLabel(a.academicPeriod)}
                  </p>
                </div>
              ),
            },
            {
              key: 'dueAt',
              header: 'Due',
              sortable: true,
              render: (a) => (
                <div className="flex flex-col items-start gap-1">
                  <span className="whitespace-nowrap">{formatDateTime(a.dueAt)}</span>
                  <DueBadge dueAt={a.dueAt} />
                </div>
              ),
            },
            { key: 'maxMarks', header: 'Max marks', align: 'right', render: (a) => formatMark(a.maxMarks) },
            {
              key: 'assignedCount',
              header: 'Students',
              align: 'center',
              render: (a) => (a.assignedCount ? <Badge tone="brand">{a.assignedCount}</Badge> : <span className="text-xs text-slate-500">None</span>),
            },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              render: (a) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" icon={Users} onClick={() => setDialog({ mode: 'edit', assignment: a })} aria-label={`Manage ${a.title}`}>
                    Manage
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(a)} aria-label={`Delete ${a.title}`} title="Delete">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ),
            },
          ]}
          rows={list.data || []}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No assignments yet"
          emptyMessage={q.search ? 'Try a different search term.' : 'Use “Add assignment” to create the first one.'}
          emptyAction={
            !q.search && (
              <Button variant="secondary" icon={NotebookPen} onClick={() => setDialog({ mode: 'create' })}>
                Add assignment
              </Button>
            )
          }
          footer={<Pagination page={q.page} pageSize={q.pageSize} total={list.meta?.total || 0} onPageChange={q.setPage} />}
        />
      </Card>

      <AssignmentDialog
        open={!!dialog}
        mode={dialog?.mode}
        assignment={dialog?.assignment}
        offerings={offerings}
        onClose={() => {
          // Students may have been removed in "Manage"; refresh the counts.
          if (dialog?.mode === 'edit') list.reload();
          setDialog(null);
        }}
        onSaved={onSaved}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => !deleting && setToDelete(null)}
        onConfirm={onDelete}
        loading={deleting}
        title="Delete assignment?"
        confirmLabel="Delete"
        message={
          toDelete &&
          `“${toDelete.title}” will be removed and its ${toDelete.assignedCount} assigned student(s) will lose access. Student accounts, enrollments and results are not affected.`
        }
      />
    </>
  );
}
