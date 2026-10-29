import { BookOpen, CheckCircle2, Download, GraduationCap, XCircle } from 'lucide-react';
import { DataTable } from '../../components/DataTable.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { GradeDistribution } from '../../components/GradeDistribution.jsx';
import { Button, Card, PageHeader, SearchInput, Select, StatCard, Spinner, ErrorState } from '../../components/ui/index.js';
import { reportsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { useOptions } from '../../hooks/useOptions.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { formatMark, formatPercent, periodLabel } from '../../utils/format.js';
import { downloadCsv } from '../../utils/csv.js';

const columnsCsv = [
  { header: 'Course code', value: (r) => r.courseCode },
  { header: 'Course name', value: (r) => r.courseName },
  { header: 'Academic year', value: (r) => r.academicPeriod?.academicYear },
  { header: 'Semester', value: (r) => r.academicPeriod?.semester },
  { header: 'Lecturer', value: (r) => r.lecturerName },
  { header: 'Enrolled', value: (r) => r.enrolled },
  { header: 'Published', value: (r) => r.published },
  { header: 'Passed', value: (r) => r.passCount },
  { header: 'Failed', value: (r) => r.failCount },
  { header: 'Pass rate', value: (r) => (r.passRate == null ? '' : (r.passRate * 100).toFixed(1)) },
  { header: 'Mean', value: (r) => r.mean },
  { header: 'Highest', value: (r) => r.highest },
  { header: 'Lowest', value: (r) => r.lowest },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const { periods } = useOptions(['periods']);
  const q = useListQuery({ pageSize: 20 });
  const periodId = q.filters.academicPeriodId || '';
  const scope = periodId ? { academicPeriodId: periodId } : {};
  const overview = useApi(() => reportsService.overview(scope), [periodId]);
  const dist = useApi(() => reportsService.gradeDistribution(scope), [periodId]);
  const perf = useApi(() => reportsService.coursePerformance(q.params), [JSON.stringify(q.params)]);

  const o = overview.data || {};

  const exportCsv = async () => {
    const all = await reportsService.coursePerformance({ ...q.params, page: 1, pageSize: 100 });
    downloadCsv(`course-performance${periodId ? `-${periodId.slice(0, 8)}` : ''}.csv`, all.data, columnsCsv);
  };

  return (
    <>
      <PageHeader
        title={user.role === 'admin' ? 'Reports' : 'Course performance'}
        description={
          user.role === 'admin'
            ? 'System-wide results analysis based on published results.'
            : 'Performance summaries for your assigned courses (all results you have entered).'
        }
        actions={
          <>
            <Select
              aria-label="Academic period"
              value={periodId}
              onChange={(e) => q.setFilter('academicPeriodId', e.target.value)}
              options={periods}
              placeholder="All periods"
              className="w-60"
            />
            <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses" value={o.courses} icon={BookOpen} loading={overview.loading} />
        <StatCard label="Results evaluated" value={o.evaluatedResults} icon={GraduationCap} tone="violet" loading={overview.loading} />
        <StatCard label="Passed" value={o.passCount} icon={CheckCircle2} tone="green" loading={overview.loading} hint={o.passRate != null ? `${formatPercent(o.passRate)} pass rate` : undefined} />
        <StatCard label="Failed" value={o.failCount} icon={XCircle} tone="red" loading={overview.loading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Course performance" className="xl:col-span-2" bodyClassName="">
          <div className="border-b border-slate-200 p-4">
            <SearchInput value={q.search} onChange={q.setSearch} placeholder="Search courses…" className="sm:max-w-xs" />
          </div>
          <DataTable
            caption="Course performance summary"
            rowKey={(r) => `${r.courseId}-${r.academicPeriodId}`}
            columns={[
              {
                key: 'course',
                header: 'Course',
                render: (r) => (
                  <div>
                    <p className="font-medium text-slate-900">{r.courseCode}</p>
                    <p className="text-xs text-slate-500">{periodLabel(r.academicPeriod)}</p>
                  </div>
                ),
              },
              { key: 'evaluated', header: 'Evaluated', align: 'center', render: (r) => `${r.passCount + r.failCount}/${r.enrolled}` },
              { key: 'passRate', header: 'Pass rate', align: 'right', render: (r) => formatPercent(r.passRate) },
              { key: 'mean', header: 'Mean', align: 'right', render: (r) => formatMark(r.mean) },
              { key: 'highest', header: 'High', align: 'right', render: (r) => formatMark(r.highest) },
              { key: 'lowest', header: 'Low', align: 'right', render: (r) => formatMark(r.lowest) },
            ]}
            rows={perf.data || []}
            loading={perf.loading}
            error={perf.error}
            onRetry={perf.reload}
            emptyTitle="No course data"
            footer={<Pagination page={q.page} pageSize={q.pageSize} total={perf.meta?.total || 0} onPageChange={q.setPage} />}
          />
        </Card>
        <Card title="Grade distribution" description={periodId ? 'Selected period' : 'All periods'}>
          {dist.loading ? <Spinner /> : dist.error ? <ErrorState message={dist.error} onRetry={dist.reload} /> : <GradeDistribution data={dist.data || []} />}
        </Card>
      </div>
    </>
  );
}
