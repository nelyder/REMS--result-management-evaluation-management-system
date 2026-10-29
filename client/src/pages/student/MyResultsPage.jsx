import { useMemo, useState } from 'react';
import { Card, EmptyState, ErrorState, PageHeader, Select, Spinner } from '../../components/ui/index.js';
import { StudentResultsTable, groupByPeriod } from '../../components/StudentResultsTable.jsx';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { formatMark, periodLabel } from '../../utils/format.js';

export default function MyResultsPage() {
  const results = useApi(() => studentsService.myResults(), []);
  const summary = useApi(() => studentsService.mySummary(), []);
  const [year, setYear] = useState('');
  const [semester, setSemester] = useState('');

  const all = useMemo(() => results.data || [], [results.data]);
  const years = [...new Set(all.map((r) => r.academicPeriod.academicYear))].sort().reverse();
  const semesters = [...new Set(all.map((r) => r.academicPeriod.semester))].sort();

  const groups = useMemo(
    () =>
      groupByPeriod(
        all.filter(
          (r) => (!year || r.academicPeriod.academicYear === year) && (!semester || String(r.academicPeriod.semester) === semester),
        ),
      ),
    [all, year, semester],
  );
  const periodSummary = (id) => summary.data?.periods?.find((p) => p.academicPeriod.id === id);

  return (
    <>
      <PageHeader
        title="My results"
        description="Published results only. Results still being processed are not shown."
        actions={
          <>
            <Select aria-label="Academic year" value={year} onChange={(e) => setYear(e.target.value)} options={years.map((y) => ({ value: y, label: y }))} placeholder="All years" className="w-40" />
            <Select aria-label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)} options={semesters.map((s) => ({ value: String(s), label: `Semester ${s}` }))} placeholder="All semesters" className="w-40" />
          </>
        }
      />
      {results.loading ? (
        <Spinner />
      ) : results.error ? (
        <ErrorState message={results.error} onRetry={results.reload} />
      ) : !groups.length ? (
        <Card>
          <EmptyState title="No published results" message={all.length ? 'No results match the selected filters.' : 'Your results will appear once published.'} />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ period, rows }) => {
            const ps = periodSummary(period.id);
            return (
              <Card
                key={period.id}
                title={periodLabel(period)}
                description={
                  ps ? `${ps.passCount} passed · ${ps.failCount} failed · ${ps.creditsAttempted} credits · Weighted average ${formatMark(ps.average)} · GPA ${ps.gpa ?? '—'}` : undefined
                }
                bodyClassName=""
              >
                <StudentResultsTable rows={rows} caption={`Results for ${periodLabel(period)}`} />
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
