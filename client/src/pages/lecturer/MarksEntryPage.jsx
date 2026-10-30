import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, History, Pencil, Save, Send, Lock } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '../../components/ui/index.js';
import { ResultHistoryModal } from '../../components/ResultHistoryModal.jsx';
import { enrollmentsService, resultsService, settingsService } from '../../services/index.js';
import { fetchAllPages } from '../../services/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { previewResult } from '../../utils/evaluation.js';
import { formatMark, periodLabel } from '../../utils/format.js';

const toInput = (v) => (v === null || v === undefined ? '' : String(Number(v)));
const toNumberOrNull = (v) => (v === '' ? null : Number(v));

export default function MarksEntryPage() {
  const { courseId, periodId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const base = isAdmin ? '/admin' : '/lecturer';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]); // enrollments with result
  const [meta, setMeta] = useState({});
  const [settings, setSettings] = useState(null);
  const [scales, setScales] = useState([]);
  const [edits, setEdits] = useState({}); // enrollmentId -> { coursework, exam }
  const [saving, setSaving] = useState({}); // enrollmentId -> bool
  const [savingAll, setSavingAll] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [correction, setCorrection] = useState(null); // { row, reason }
  const [historyFor, setHistoryFor] = useState(null);
  const [workflow, setWorkflow] = useState(null); // 'publish' | 'submit'
  const [workflowBusy, setWorkflowBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [enr, ev, gs] = await Promise.all([
        fetchAllPages((p) => enrollmentsService.forCourse(courseId, p), { academicPeriodId: periodId }),
        settingsService.getEvaluation(),
        settingsService.getGradingScales({ academicPeriodId: periodId }),
      ]);
      // Completed enrollments keep their results; only withdrawn students are hidden.
      setRows(enr.data.filter((r) => r.enrollmentStatus !== 'withdrawn'));
      setMeta(enr.meta || {});
      setSettings(ev.data);
      setScales(gs.data.bands);
      setEdits({});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [courseId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before leaving with unsaved marks.
  const dirtyIds = Object.keys(edits);
  useEffect(() => {
    if (!dirtyIds.length) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyIds.length]);

  const passMark = meta.course?.passMark ?? settings?.defaultPassMark ?? 50;
  const evalConfig = settings && { courseworkMax: settings.courseworkMax, examMax: settings.examMax, passMark, scales };

  const rowEditMode = (row) => {
    const status = row.result?.publicationStatus;
    if (!status || status === 'draft') return 'edit';
    if (status === 'submitted') return isAdmin ? 'edit' : 'locked';
    // published / corrected
    return isAdmin || settings?.lecturerCanCorrect ? 'correct' : 'locked';
  };

  const valuesFor = (row) =>
    edits[row.id] || { coursework: toInput(row.result?.courseworkMark), exam: toInput(row.result?.examinationMark) };

  const setValue = (row, field, value) => {
    setEdits((e) => {
      const current = e[row.id] || { coursework: toInput(row.result?.courseworkMark), exam: toInput(row.result?.examinationMark) };
      const next = { ...current, [field]: value };
      const unchanged = next.coursework === toInput(row.result?.courseworkMark) && next.exam === toInput(row.result?.examinationMark);
      const copy = { ...e };
      if (unchanged) delete copy[row.id];
      else copy[row.id] = next;
      return copy;
    });
  };

  const applySaved = (enrollmentId, result) => {
    setRows((rs) => rs.map((r) => (r.id === enrollmentId ? { ...r, result } : r)));
    setEdits((e) => {
      const copy = { ...e };
      delete copy[enrollmentId];
      return copy;
    });
  };

  const saveRow = async (row, reason) => {
    const v = valuesFor(row);
    const preview = previewResult(v, evalConfig);
    if (preview.errors.coursework || preview.errors.exam) {
      toast.error(`${row.student.registrationNumber}: ${preview.errors.coursework || preview.errors.exam}`);
      return false;
    }
    setSaving((s) => ({ ...s, [row.id]: true }));
    try {
      const marks = { courseworkMark: toNumberOrNull(v.coursework), examinationMark: toNumberOrNull(v.exam) };
      const { data } = row.result
        ? await resultsService.update(row.result.id, { ...marks, version: row.result.version, ...(reason && { reason }) })
        : await resultsService.save({ enrollmentId: row.id, ...marks });
      applySaved(row.id, data);
      return true;
    } catch (err) {
      if (err.status === 409 && !row.result) {
        toast.error(`${row.student.registrationNumber}: someone else has already saved a result for this student. Reload the page to see it.`);
      } else if (err.status === 409) {
        toast.error(`${row.student.registrationNumber}: this result was changed by someone else. Latest values have been loaded.`);
        try {
          const { data } = await resultsService.get(row.result.id);
          applySaved(row.id, data);
        } catch {
          /* keep local edit */
        }
      } else {
        toast.error(`${row.student.registrationNumber}: ${err.message}`);
      }
      return false;
    } finally {
      setSaving((s) => ({ ...s, [row.id]: false }));
    }
  };

  const saveAll = async () => {
    const targets = rows.filter((r) => edits[r.id] && rowEditMode(r) === 'edit');
    if (!targets.length) return;
    setSavingAll(true);
    let ok = 0;
    for (const row of targets) {
      // Sequential to keep error reporting clear and avoid hammering the API.
      if (await saveRow(row)) ok++;
    }
    setSavingAll(false);
    if (ok) toast.success(`${ok} result(s) saved.`);
  };

  const cancelCorrection = () => {
    // Discard the uncommitted correction values for that row.
    setEdits((e) => {
      const copy = { ...e };
      delete copy[correction.row.id];
      return copy;
    });
    setCorrection(null);
  };

  const submitCorrection = async () => {
    if (!correction.reason.trim() || correction.reason.trim().length < 5) {
      toast.error('Give a reason of at least 5 characters for the correction.');
      return;
    }
    if (await saveRow(correction.row, correction.reason.trim())) {
      toast.success('Correction saved and recorded in the audit log.');
      setCorrection(null);
    }
  };

  const runWorkflow = async () => {
    setWorkflowBusy(true);
    try {
      const body = { academicPeriodId: periodId };
      const { data } =
        workflow === 'publish'
          ? await resultsService.publishCourse(courseId, body)
          : await resultsService.submitCourse(courseId, body);
      toast.success(`${data.count} result(s) ${workflow === 'publish' ? 'published' : 'submitted for publication'}.`);
      setWorkflow(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWorkflowBusy(false);
    }
  };

  const exportSheet = async (format) => {
    const code = (meta.course?.code || 'course').replace(/\s+/g, '');
    try {
      await resultsService.exportCourse(courseId, { academicPeriodId: periodId, format }, `${code}-results.${format}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (s && !`${r.student.fullName} ${r.student.registrationNumber}`.toLowerCase().includes(s)) return false;
      if (statusFilter === 'none') return !r.result;
      if (statusFilter) return r.result?.publicationStatus === statusFilter || r.result?.resultStatus === statusFilter;
      return true;
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: rows.length, entered: 0, complete: 0, draftComplete: 0, published: 0, submitted: 0 };
    for (const r of rows) {
      if (!r.result) continue;
      c.entered++;
      const complete = r.result.resultStatus !== 'incomplete';
      if (complete) c.complete++;
      if (['published', 'corrected'].includes(r.result.publicationStatus)) c.published++;
      if (r.result.publicationStatus === 'submitted') c.submitted++;
      if (complete && r.result.publicationStatus === 'draft') c.draftComplete++;
    }
    return c;
  }, [rows]);

  // Enter moves to the same field on the next row for fast keyboard entry.
  const onKeyDown = (e, index, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    document.querySelector(`[data-mark="${field}-${index + 1}"]`)?.focus();
  };

  if (loading) return <Spinner label="Loading class list" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const canPublish = isAdmin || settings?.lecturerCanPublish;
  const publishable = isAdmin ? counts.draftComplete + counts.submitted : counts.draftComplete;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to={isAdmin ? '/admin/publication' : `${base}/courses`} className="inline-flex items-center gap-1 hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {isAdmin ? 'Publication' : 'My courses'}
          </Link>
        }
        title={meta.course ? `${meta.course.code} — ${meta.course.name}` : 'Enter marks'}
        description={`${periodLabel(meta.academicPeriod)} · Coursework /${settings.courseworkMax} · Exam /${settings.examMax} · Pass mark ${passMark}`}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => exportSheet('csv')}>CSV</Button>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={() => exportSheet('xlsx')}>Excel</Button>
            {canPublish ? (
              <Button variant="success" icon={Send} disabled={!publishable || dirtyIds.length > 0} onClick={() => setWorkflow('publish')}>
                Publish ({publishable})
              </Button>
            ) : (
              <Button icon={Send} disabled={!counts.draftComplete || dirtyIds.length > 0} onClick={() => setWorkflow('submit')}>
                Submit for publication ({counts.draftComplete})
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Students', counts.total],
          ['Marks entered', counts.entered],
          ['Complete', counts.complete],
          ['Published', counts.published],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-surface px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-lg font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <Card bodyClassName="">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name or reg. number…" className="sm:max-w-xs sm:flex-1" />
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="All students"
              className="sm:w-48"
              options={[
                { value: 'none', label: 'No marks yet' },
                { value: 'incomplete', label: 'Incomplete' },
                { value: 'draft', label: 'Draft' },
                { value: 'submitted', label: 'Submitted' },
                { value: 'published', label: 'Published' },
                { value: 'corrected', label: 'Corrected' },
                { value: 'pass', label: 'Pass' },
                { value: 'fail', label: 'Fail' },
              ]}
            />
          </div>
          <div className="flex items-center gap-3">
            {dirtyIds.length > 0 && <Badge tone="amber">{dirtyIds.length} unsaved</Badge>}
            <Button icon={Save} onClick={saveAll} loading={savingAll} disabled={!dirtyIds.length}>Save all</Button>
          </div>
        </div>

        {!rows.length ? (
          <EmptyState title="No students enrolled" message="Students must be enrolled on this course before marks can be entered." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Marks entry for {meta.course?.code}</caption>
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">Student</th>
                  <th scope="col" className="px-3 py-3 text-left">Coursework /{settings.courseworkMax}</th>
                  <th scope="col" className="px-3 py-3 text-left">Exam /{settings.examMax}</th>
                  <th scope="col" className="px-3 py-3 text-right">Total</th>
                  <th scope="col" className="px-3 py-3 text-center">Grade</th>
                  <th scope="col" className="px-3 py-3 text-left">Result</th>
                  <th scope="col" className="px-3 py-3 text-left">Status</th>
                  <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-surface">
                {filtered.map((row, index) => {
                  const mode = rowEditMode(row);
                  const v = valuesFor(row);
                  const dirty = !!edits[row.id];
                  const preview = previewResult(v, evalConfig);
                  const editable = mode === 'edit';
                  const showServer = !dirty && row.result;
                  const total = showServer ? row.result.totalMark : preview.total;
                  const grade = showServer ? row.result.grade : preview.grade;
                  const status = showServer ? row.result.resultStatus : preview.status;
                  const inputClass = (err) =>
                    `w-20 rounded-md border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-slate-50 disabled:text-slate-600 ${err ? 'border-red-500' : 'border-slate-300'}`;
                  return (
                    <tr key={row.id} className={dirty ? 'bg-amber-50/50' : undefined}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-900">{row.student.fullName}</p>
                        <p className="font-mono text-xs text-slate-500">{row.student.registrationNumber}</p>
                      </td>
                      {['coursework', 'exam'].map((field) => (
                        <td key={field} className="px-3 py-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min={0}
                            max={field === 'coursework' ? settings.courseworkMax : settings.examMax}
                            data-mark={`${field}-${index}`}
                            aria-label={`${field === 'coursework' ? 'Coursework' : 'Exam'} mark for ${row.student.fullName}`}
                            aria-invalid={preview.errors[field] ? true : undefined}
                            title={preview.errors[field] || undefined}
                            className={inputClass(preview.errors[field])}
                            value={v[field]}
                            disabled={!editable}
                            onChange={(e) => setValue(row, field, e.target.value)}
                            onKeyDown={(e) => onKeyDown(e, index, field)}
                          />
                          {preview.errors[field] && <p className="mt-0.5 text-[11px] text-red-700">{preview.errors[field]}</p>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMark(total)}</td>
                      <td className="px-3 py-2 text-center font-semibold">{grade || '—'}</td>
                      <td className="px-3 py-2">{status ? <StatusBadge status={status} /> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2">
                        {row.result ? <StatusBadge status={row.result.publicationStatus} /> : <span className="text-xs text-slate-400">Not entered</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          {editable && (
                            <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} loading={saving[row.id]} onClick={() => saveRow(row)}>
                              Save
                            </Button>
                          )}
                          {mode === 'correct' && (
                            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setCorrection({ row, reason: '' })}>
                              Correct
                            </Button>
                          )}
                          {mode === 'locked' && (
                            <span className="inline-flex items-center gap-1 px-2 text-xs text-slate-500" title="Locked by the publication workflow">
                              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Locked
                            </span>
                          )}
                          {row.result && (
                            <Button size="icon" variant="ghost" onClick={() => setHistoryFor(row)} aria-label={`View history for ${row.student.fullName}`} title="History">
                              <History className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && <EmptyState title="No students match your filters" />}
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Totals, grades and pass/fail shown while typing are a preview; the server recalculates them when you save. Missing marks are
        never treated as zero — the result stays <em>incomplete</em> and cannot be published.
      </p>

      <Modal
        open={!!correction}
        onClose={cancelCorrection}
        title="Correct published result"
        description={correction && `${correction.row.student.fullName} · ${correction.row.student.registrationNumber}`}
        footer={
          <>
            <Button variant="secondary" onClick={cancelCorrection}>Cancel</Button>
            <Button onClick={submitCorrection} loading={correction && saving[correction.row.id]}>Save correction</Button>
          </>
        }
      >
        {correction && (
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              This result is visible to the student. The change will be marked as a correction and recorded with your reason.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {['coursework', 'exam'].map((field) => (
                <label key={field} className="text-sm font-medium text-slate-700">
                  {field === 'coursework' ? `Coursework /${settings.courseworkMax}` : `Exam /${settings.examMax}`}
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={valuesFor(correction.row)[field]}
                    onChange={(e) => setValue(correction.row, field, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <Textarea
              label="Reason for correction"
              required
              value={correction.reason}
              onChange={(e) => setCorrection((c) => ({ ...c, reason: e.target.value }))}
              placeholder="e.g. Exam script re-marked after moderation"
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!workflow}
        onClose={() => setWorkflow(null)}
        onConfirm={runWorkflow}
        loading={workflowBusy}
        tone="primary"
        title={workflow === 'publish' ? 'Publish results?' : 'Submit results for publication?'}
        confirmLabel={workflow === 'publish' ? 'Publish' : 'Submit'}
        message={
          workflow === 'publish'
            ? `${publishable} complete result(s) will be published and become visible to students. Incomplete results are not published.`
            : `${counts.draftComplete} complete result(s) will be sent to the administrator for publication. You won't be able to edit them unless they are returned.`
        }
      />

      {historyFor && (
        <ResultHistoryModal result={historyFor.result} studentName={historyFor.student.fullName} onClose={() => setHistoryFor(null)} />
      )}
    </>
  );
}
