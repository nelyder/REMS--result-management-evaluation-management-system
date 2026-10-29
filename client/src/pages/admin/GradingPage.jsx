import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button, Card, Checkbox, ErrorState, Input, PageHeader, Select, Spinner } from '../../components/ui/index.js';
import { settingsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useOptions } from '../../hooks/useOptions.js';
import { useToast } from '../../contexts/ToastContext.jsx';

/** Bands must be contiguous and cover 0–100 with no overlap (mirrors server validation). */
export function validateBands(bands) {
  if (!bands.length) return 'Add at least one grade band.';
  const parsed = bands.map((b) => ({ ...b, min: Number(b.minimumMark), max: Number(b.maximumMark) }));
  for (const b of parsed) {
    if (!String(b.grade).trim()) return 'Every band needs a grade letter.';
    if (b.minimumMark === '' || b.maximumMark === '' || Number.isNaN(b.min) || Number.isNaN(b.max)) return `Band ${b.grade}: enter both marks.`;
    if (b.min < 0 || b.max > 100 || b.min > b.max) return `Band ${b.grade}: marks must satisfy 0 ≤ min ≤ max ≤ 100.`;
  }
  const sorted = [...parsed].sort((a, b) => a.min - b.min);
  if (sorted[0].min !== 0) return 'The lowest band must start at 0.';
  if (sorted[sorted.length - 1].max !== 100) return 'The highest band must end at 100.';
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.round((sorted[i].min - sorted[i - 1].max) * 100) / 100;
    if (gap <= 0) return `Bands ${sorted[i - 1].grade} and ${sorted[i].grade} overlap.`;
    if (gap > 0.01) return `There is a gap between ${sorted[i - 1].grade} and ${sorted[i].grade}.`;
  }
  const grades = parsed.map((b) => b.grade.trim().toUpperCase());
  if (new Set(grades).size !== grades.length) return 'Grade letters must be unique.';
  return null;
}

function EvaluationSettings() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => settingsService.getEvaluation(), []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  if (loading && !form) return <Card title="Mark scheme"><Spinner /></Card>;
  if (error) return <Card title="Mark scheme"><ErrorState message={error} onRetry={reload} /></Card>;
  if (!form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    const cw = Number(form.courseworkMax);
    const ex = Number(form.examMax);
    const pm = Number(form.defaultPassMark);
    if (cw < 0 || ex < 0 || cw + ex !== 100) return setFormError('Coursework and exam maximums must add up to 100.');
    if (pm < 0 || pm > 100) return setFormError('Pass mark must be between 0 and 100.');
    setFormError('');
    setSaving(true);
    try {
      await settingsService.updateEvaluation({
        courseworkMax: cw,
        examMax: ex,
        defaultPassMark: pm,
        lecturerCanPublish: !!form.lecturerCanPublish,
        lecturerCanCorrect: !!form.lecturerCanCorrect,
      });
      toast.success('Evaluation settings saved.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Mark scheme & workflow" description="Applies to all newly saved results. Existing published results keep their stored values.">
      <form onSubmit={save} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Coursework maximum" type="number" min={0} max={100} value={form.courseworkMax} onChange={(e) => set('courseworkMax', e.target.value)} />
          <Input label="Examination maximum" type="number" min={0} max={100} value={form.examMax} onChange={(e) => set('examMax', e.target.value)} />
          <Input label="Default pass mark" type="number" min={0} max={100} step="0.5" value={form.defaultPassMark} onChange={(e) => set('defaultPassMark', e.target.value)} hint="Courses may override this." />
        </div>
        <div className="space-y-3">
          <Checkbox
            label="Lecturers may publish results"
            description="If off, lecturers submit results and an administrator publishes them."
            checked={!!form.lecturerCanPublish}
            onChange={(e) => set('lecturerCanPublish', e.target.checked)}
          />
          <Checkbox
            label="Lecturers may correct published results"
            description="Corrections always require a reason and are recorded in the audit log."
            checked={!!form.lecturerCanCorrect}
            onChange={(e) => set('lecturerCanCorrect', e.target.checked)}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" icon={Save} loading={saving}>Save settings</Button>
        </div>
      </form>
    </Card>
  );
}

function GradingScaleEditor() {
  const toast = useToast();
  const { periods } = useOptions(['periods']);
  const [periodId, setPeriodId] = useState('');
  const { data, loading, error, reload } = useApi(
    () => settingsService.getGradingScales(periodId ? { academicPeriodId: periodId } : {}),
    [periodId],
  );
  const [bands, setBands] = useState([]);
  const [saving, setSaving] = useState(false);
  const [bandError, setBandError] = useState('');

  useEffect(() => {
    if (data) setBands(data.bands.map((b) => ({ ...b, key: crypto.randomUUID() })));
  }, [data]);

  const update = (key, field, value) => setBands((bs) => bs.map((b) => (b.key === key ? { ...b, [field]: value } : b)));
  const add = () =>
    setBands((bs) => [...bs, { key: crypto.randomUUID(), grade: '', minimumMark: '', maximumMark: '', description: '', gradePoint: '' }]);
  const remove = (key) => setBands((bs) => bs.filter((b) => b.key !== key));

  const save = async () => {
    const msg = validateBands(bands);
    setBandError(msg || '');
    if (msg) return;
    setSaving(true);
    try {
      await settingsService.updateGradingScales({
        academicPeriodId: periodId || null,
        bands: bands.map((b) => ({
          grade: b.grade.trim().toUpperCase(),
          minimumMark: Number(b.minimumMark),
          maximumMark: Number(b.maximumMark),
          description: b.description?.trim() || null,
          gradePoint: b.gradePoint === '' || b.gradePoint == null ? null : Number(b.gradePoint),
        })),
      });
      toast.success('Grading scale saved.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...bands].sort((a, b) => Number(b.minimumMark || 0) - Number(a.minimumMark || 0));

  return (
    <Card
      title="Grading scale"
      description="Grade bands by total mark. A period-specific scale overrides the default scale."
      actions={
        <Select
          aria-label="Scale applies to"
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          options={periods}
          placeholder="Default scale (all periods)"
          className="w-64"
        />
      }
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          {data?.inherited && periodId && (
            <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
              This period currently uses the default scale. Saving creates a period-specific scale.
            </p>
          )}
          {bandError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{bandError}</p>}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Grade bands</caption>
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th scope="col" className="pb-2 pr-3">Grade</th>
                  <th scope="col" className="pb-2 pr-3">Min mark</th>
                  <th scope="col" className="pb-2 pr-3">Max mark</th>
                  <th scope="col" className="pb-2 pr-3">Grade point</th>
                  <th scope="col" className="pb-2 pr-3">Description</th>
                  <th scope="col" className="pb-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => (
                  <tr key={b.key}>
                    <td className="py-1 pr-3"><input aria-label="Grade" className="w-16 rounded-lg border border-slate-300 px-2 py-1.5" value={b.grade} onChange={(e) => update(b.key, 'grade', e.target.value)} maxLength={3} /></td>
                    <td className="py-1 pr-3"><input aria-label={`Minimum mark for ${b.grade}`} type="number" step="0.01" className="w-24 rounded-lg border border-slate-300 px-2 py-1.5" value={b.minimumMark} onChange={(e) => update(b.key, 'minimumMark', e.target.value)} /></td>
                    <td className="py-1 pr-3"><input aria-label={`Maximum mark for ${b.grade}`} type="number" step="0.01" className="w-24 rounded-lg border border-slate-300 px-2 py-1.5" value={b.maximumMark} onChange={(e) => update(b.key, 'maximumMark', e.target.value)} /></td>
                    <td className="py-1 pr-3"><input aria-label={`Grade point for ${b.grade}`} type="number" step="0.1" className="w-20 rounded-lg border border-slate-300 px-2 py-1.5" value={b.gradePoint ?? ''} onChange={(e) => update(b.key, 'gradePoint', e.target.value)} /></td>
                    <td className="py-1 pr-3"><input aria-label={`Description for ${b.grade}`} className="w-full min-w-40 rounded-lg border border-slate-300 px-2 py-1.5" value={b.description ?? ''} onChange={(e) => update(b.key, 'description', e.target.value)} /></td>
                    <td className="py-1">
                      <Button variant="ghost" size="icon" onClick={() => remove(b.key)} aria-label={`Remove band ${b.grade}`}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <Button variant="secondary" icon={Plus} onClick={add}>Add band</Button>
            <Button icon={Save} onClick={save} loading={saving}>Save scale</Button>
          </div>
        </>
      )}
    </Card>
  );
}

export default function GradingPage() {
  return (
    <>
      <PageHeader title="Grading rules" description="Configure the mark scheme, pass mark, publication workflow and grade bands." />
      <div className="space-y-6">
        <EvaluationSettings />
        <GradingScaleEditor />
      </div>
    </>
  );
}
