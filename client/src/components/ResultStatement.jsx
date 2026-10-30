import { useState } from 'react';
import { Download, GraduationCap, Printer } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Spinner } from './ui/index.js';
import { StudentResultsTable, groupByPeriod } from './StudentResultsTable.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { formatMark, periodLabel } from '../utils/format.js';

/**
 * Printable statement of published results, shared by the student's own page and the
 * admin view of a student. `person` is profile-shaped:
 * { fullName, student: { registrationNumber, programme: { code, name }, yearOfStudy } }.
 */
export function ResultStatement({ title, description, breadcrumb, person, results, summary, loading, error, onRetry }) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const s = person?.student || {};
  const groups = results ? [...groupByPeriod(results)].reverse() : [];
  const c = summary?.cumulative;

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      // Loaded on demand to keep jsPDF out of the main bundle.
      const { downloadStatementPdf } = await import('../utils/pdf.js');
      downloadStatementPdf({ profile: person, results, summary });
    } catch {
      toast.error('Could not generate the PDF. Try printing instead.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb}
        title={title}
        description={description}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!groups.length}>Print</Button>
            <Button icon={Download} onClick={downloadPdf} loading={downloading} disabled={!groups.length || !summary}>Download PDF</Button>
          </>
        }
      />
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !groups.length ? (
        <EmptyState title="No published results" message="A statement becomes available once results are published." />
      ) : (
        <article className="rounded-xl border border-slate-200 bg-surface p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-brand-700 p-2"><GraduationCap className="h-6 w-6 text-on-brand" aria-hidden="true" /></div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Statement of Results</h2>
                <p className="text-xs text-slate-500">Result Evaluation and Management System</p>
              </div>
            </div>
            <p className="text-right text-xs text-slate-500">Generated {new Date().toLocaleDateString()}</p>
          </header>
          <dl className="grid gap-x-8 gap-y-2 py-4 text-sm sm:grid-cols-2">
            <div><dt className="inline font-medium text-slate-500">Name: </dt><dd className="inline">{person.fullName}</dd></div>
            <div><dt className="inline font-medium text-slate-500">Registration no.: </dt><dd className="inline font-mono">{s.registrationNumber}</dd></div>
            <div><dt className="inline font-medium text-slate-500">Programme: </dt><dd className="inline">{s.programme?.name}</dd></div>
            <div><dt className="inline font-medium text-slate-500">Year of study: </dt><dd className="inline">{s.yearOfStudy}</dd></div>
          </dl>
          <div className="space-y-6">
            {groups.map(({ period, rows }) => {
              const ps = summary?.periods?.find((p) => p.academicPeriod.id === period.id);
              return (
                <section key={period.id} className="break-inside-avoid">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{periodLabel(period)}</h3>
                  <div className="rounded-lg border border-slate-200">
                    <StudentResultsTable rows={rows} caption={periodLabel(period)} />
                  </div>
                  {ps && (
                    <p className="mt-1.5 text-xs text-slate-600">
                      Credits {ps.creditsPassed}/{ps.creditsAttempted} · Weighted average {formatMark(ps.average)} · GPA {ps.gpa ?? '—'}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          {c && (
            <footer className="mt-6 border-t border-slate-200 pt-4 text-sm">
              <p className="font-semibold text-slate-900">Cumulative</p>
              <p className="text-slate-600">
                {c.courses} courses · Credits earned {c.creditsEarned}/{c.creditsAttempted} · Weighted average {formatMark(c.average)} · CGPA {c.gpa ?? '—'}
              </p>
              <p className="mt-4 text-xs text-slate-500">This statement lists published results only and is unofficial unless certified by the academic registry.</p>
            </footer>
          )}
        </article>
      )}
    </>
  );
}
