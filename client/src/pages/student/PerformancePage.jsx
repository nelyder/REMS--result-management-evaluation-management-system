import { Award, BookOpen, CheckCircle2, TrendingUp } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '../../components/ui/index.js';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { formatMark, periodLabel } from '../../utils/format.js';

export default function PerformancePage() {
  const summary = useApi(() => studentsService.mySummary(), []);
  const c = summary.data?.cumulative || {};
  const periods = summary.data?.periods || [];

  return (
    <>
      <PageHeader title="Academic performance" description="Summary of your published results, weighted by course credit units." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses" value={c.courses} icon={BookOpen} loading={summary.loading} hint={c.courses ? `${c.passCount} passed · ${c.failCount} failed` : undefined} />
        <StatCard label="Credits earned" value={c.creditsAttempted != null ? `${c.creditsEarned}/${c.creditsAttempted}` : undefined} icon={CheckCircle2} tone="green" loading={summary.loading} />
        <StatCard label="Weighted average" value={c.average != null ? formatMark(c.average) : undefined} icon={TrendingUp} tone="violet" loading={summary.loading} />
        <StatCard label="CGPA" value={c.gpa} icon={Award} tone="amber" loading={summary.loading} />
      </div>
      <Card title="By semester" bodyClassName="">
        {summary.loading ? (
          <Spinner />
        ) : summary.error ? (
          <ErrorState message={summary.error} onRetry={summary.reload} />
        ) : !periods.length ? (
          <EmptyState title="No published results yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Performance by semester</caption>
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left">Period</th>
                  <th scope="col" className="px-3 py-2.5 text-center">Courses</th>
                  <th scope="col" className="px-3 py-2.5 text-center">Passed</th>
                  <th scope="col" className="px-3 py-2.5 text-center">Credits</th>
                  <th scope="col" className="px-3 py-2.5 text-right">GPA</th>
                  <th scope="col" className="px-4 py-2.5 text-left">Weighted average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {periods.map((p) => (
                  <tr key={p.academicPeriod.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{periodLabel(p.academicPeriod)}</td>
                    <td className="px-3 py-3 text-center">{p.courses}</td>
                    <td className="px-3 py-3 text-center">{p.passCount}/{p.courses}</td>
                    <td className="px-3 py-3 text-center">{p.creditsPassed}/{p.creditsAttempted}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{p.gpa ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-32 rounded-full bg-slate-100 sm:w-48" aria-hidden="true">
                          <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, p.average ?? 0)}%` }} />
                        </div>
                        <span className="tabular-nums">{formatMark(p.average)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
