import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardEdit, Send, Undo2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { Badge, Button, Card, ConfirmDialog, PageHeader, SearchInput, Select } from '../../components/ui/index.js';
import { reportsService, resultsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { useOptions } from '../../hooks/useOptions.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { periodLabel } from '../../utils/format.js';

export default function PublicationPage() {
  const toast = useToast();
  const { periods } = useOptions(['periods']);
  const q = useListQuery({ pageSize: 20 });
  const list = useApi(() => reportsService.coursePerformance(q.params), [JSON.stringify(q.params)]);
  const [action, setAction] = useState(null); // { type: 'publish' | 'return', row }
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const { type, row } = action;
    setBusy(true);
    try {
      const body = { academicPeriodId: row.academicPeriodId };
      const { data } =
        type === 'publish'
          ? await resultsService.publishCourse(row.courseId, body)
          : await resultsService.returnCourse(row.courseId, body);
      toast.success(
        type === 'publish' ? `${data.count} result(s) published.` : `${data.count} result(s) returned to draft.`,
      );
      setAction(null);
      list.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Result publication"
        description="Review completion and publish results per course. Only complete results (both marks entered) are published."
      />
      <Card bodyClassName="">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row">
          <SearchInput value={q.search} onChange={q.setSearch} placeholder="Search courses…" className="sm:max-w-xs sm:flex-1" />
          <Select
            aria-label="Academic period"
            value={q.filters.academicPeriodId ?? ''}
            onChange={(e) => q.setFilter('academicPeriodId', e.target.value)}
            options={periods}
            placeholder="All periods"
            className="sm:w-64"
          />
        </div>
        <DataTable
          caption="Publication status by course"
          rowKey={(r) => `${r.courseId}-${r.academicPeriodId}`}
          columns={[
            {
              key: 'course',
              header: 'Course',
              render: (r) => (
                <div>
                  <p className="font-mono text-xs text-slate-500">{r.courseCode}</p>
                  <p className="font-medium text-slate-900">{r.courseName}</p>
                  <p className="text-xs text-slate-500">{periodLabel(r.academicPeriod)} · {r.lecturerName || 'Unassigned'}</p>
                </div>
              ),
            },
            { key: 'enrolled', header: 'Enrolled', align: 'center' },
            { key: 'incomplete', header: 'Missing marks', align: 'center', render: (r) => (r.incomplete ? <Badge tone="amber">{r.incomplete}</Badge> : 0) },
            { key: 'draft', header: 'Draft', align: 'center' },
            { key: 'submitted', header: 'Submitted', align: 'center', render: (r) => (r.submitted ? <Badge tone="violet">{r.submitted}</Badge> : 0) },
            { key: 'published', header: 'Published', align: 'center', render: (r) => (r.published ? <Badge tone="blue">{r.published}</Badge> : 0) },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              render: (r) => {
                const publishable = (r.readyToPublish ?? 0) > 0;
                return (
                  <div className="flex justify-end gap-1">
                    <Link
                      to={`/admin/courses/${r.courseId}/periods/${r.academicPeriodId}/marks`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      <ClipboardEdit className="h-4 w-4" aria-hidden="true" /> Review
                    </Link>
                    {r.submitted > 0 && (
                      <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setAction({ type: 'return', row: r })}>
                        Return
                      </Button>
                    )}
                    <Button size="sm" icon={Send} disabled={!publishable} onClick={() => setAction({ type: 'publish', row: r })}>
                      Publish{publishable ? ` (${r.readyToPublish})` : ''}
                    </Button>
                  </div>
                );
              },
            },
          ]}
          rows={list.data || []}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No courses with enrollments"
          footer={<Pagination page={q.page} pageSize={q.pageSize} total={list.meta?.total || 0} onPageChange={q.setPage} />}
        />
      </Card>

      <ConfirmDialog
        open={!!action}
        onClose={() => setAction(null)}
        onConfirm={run}
        loading={busy}
        tone={action?.type === 'publish' ? 'primary' : 'danger'}
        title={action?.type === 'publish' ? 'Publish results?' : 'Return results to lecturer?'}
        confirmLabel={action?.type === 'publish' ? 'Publish' : 'Return to draft'}
        message={
          action?.type === 'publish'
            ? `${action.row.readyToPublish} complete result(s) for ${action.row.courseCode} will become visible to students. Incomplete results stay unpublished. Later changes will be recorded as corrections.`
            : `Submitted results for ${action?.row.courseCode} will return to draft so the lecturer can revise them.`
        }
      />
    </>
  );
}
