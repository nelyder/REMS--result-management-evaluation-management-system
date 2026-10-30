import { useEffect, useMemo, useState } from 'react';
import { UserMinus, Users } from 'lucide-react';
import { Badge, Button, ConfirmDialog, ErrorState, Input, Modal, Select, Spinner, Textarea } from './ui/index.js';
import { StudentPicker } from './StudentPicker.jsx';
import { fieldErrorsFrom } from './CrudPage.jsx';
import { courseworkService } from '../services/index.js';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { periodLabel, toDateTimeLocal } from '../utils/format.js';

const EMPTY = { title: '', description: '', courseId: '', academicYear: '', semester: '', dueAt: '', maxMarks: '' };

function validate(form, { periodId, isCreate }) {
  const e = {};
  if (form.title.trim().length < 3) e.title = 'Enter a title of at least 3 characters';
  if (isCreate) {
    if (!form.courseId) e.courseId = 'Choose a course';
    if (!form.academicYear) e.academicYear = 'Choose an academic year';
    if (!form.semester) e.semester = 'Choose a semester';
    else if (!periodId) e.semester = 'No such period for this course';
  }
  if (!form.dueAt) e.dueAt = 'Choose a due date and time';
  else if (Number.isNaN(new Date(form.dueAt).getTime())) e.dueAt = 'Enter a valid date and time';
  else if (isCreate && new Date(form.dueAt).getTime() <= Date.now()) e.dueAt = 'The due date must be in the future';
  const max = Number(form.maxMarks);
  if (form.maxMarks === '' || !Number.isFinite(max) || max <= 0 || max > 1000) e.maxMarks = 'Enter a number from 0.01 to 1000';
  else if (Math.abs(Math.round(max * 100) - max * 100) > 1e-6) e.maxMarks = 'Use at most 2 decimal places';
  return e;
}

/**
 * Add / manage a coursework assignment and the students who can see it.
 *
 * offerings: { courses: [{ value, label }], periodsFor(courseId) => [{ id, academicYear, semester }] }
 *   — only course offerings the user may manage (a lecturer's assigned courses).
 * assignment: the assignment being managed (mode 'edit'), from GET /assignments.
 */
export function AssignmentDialog({ open, mode = 'create', assignment = null, offerings, onClose, onSaved }) {
  const toast = useToast();
  const isCreate = mode === 'create';
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [toRemove, setToRemove] = useState(null); // assigned-student row
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSelected(new Set());
    setToRemove(null);
    setForm(
      isCreate || !assignment
        ? EMPTY
        : {
            title: assignment.title,
            description: assignment.description ?? '',
            courseId: assignment.courseId,
            academicYear: assignment.academicPeriod?.academicYear ?? '',
            semester: String(assignment.academicPeriod?.semester ?? ''),
            dueAt: toDateTimeLocal(assignment.dueAt),
            maxMarks: String(assignment.maxMarks ?? ''),
          },
    );
  }, [open, isCreate, assignment]);

  // ---- course -> academic year -> semester (create mode only)
  const periods = useMemo(() => (form.courseId ? offerings.periodsFor(form.courseId) : []), [offerings, form.courseId]);
  const years = useMemo(() => [...new Set(periods.map((p) => p.academicYear))].sort().reverse(), [periods]);
  const semesters = useMemo(
    () => periods.filter((p) => p.academicYear === form.academicYear).map((p) => p.semester).sort(),
    [periods, form.academicYear],
  );
  const periodId = isCreate
    ? periods.find((p) => p.academicYear === form.academicYear && String(p.semester) === form.semester)?.id ?? ''
    : assignment?.academicPeriodId;

  // Pick the only option automatically, and clear choices that no longer apply.
  useEffect(() => {
    if (!isCreate || !form.courseId) return;
    if (form.academicYear && !years.includes(form.academicYear)) setForm((f) => ({ ...f, academicYear: '', semester: '' }));
    else if (!form.academicYear && years.length === 1) setForm((f) => ({ ...f, academicYear: years[0] }));
  }, [isCreate, form.courseId, form.academicYear, years]);
  useEffect(() => {
    if (!isCreate || !form.academicYear) return;
    const values = semesters.map(String);
    if (form.semester && !values.includes(form.semester)) setForm((f) => ({ ...f, semester: '' }));
    else if (!form.semester && values.length === 1) setForm((f) => ({ ...f, semester: values[0] }));
  }, [isCreate, form.academicYear, form.semester, semesters]);

  // A new course offering means a different class list.
  useEffect(() => setSelected(new Set()), [periodId, form.courseId]);

  // ---- students
  const eligible = useApi(
    () =>
      isCreate
        ? courseworkService.eligibleForOffering({ courseId: form.courseId, academicPeriodId: periodId })
        : courseworkService.eligible(assignment.id),
    [isCreate, assignment?.id, form.courseId, periodId],
    { enabled: open && (isCreate ? Boolean(form.courseId && periodId) : Boolean(assignment)) },
  );
  const assigned = useApi(() => courseworkService.students(assignment.id), [assignment?.id], {
    enabled: open && !isCreate && Boolean(assignment),
  });
  // In edit mode, the picker offers only students not yet assigned.
  const candidates = useMemo(() => (eligible.data || []).filter((s) => !s.assigned), [eligible.data]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const nextErrors = validate(form, { periodId, isCreate });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    const details = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      dueAt: new Date(form.dueAt).toISOString(),
      maxMarks: Number(form.maxMarks),
    };
    try {
      if (isCreate) {
        await courseworkService.create({ ...details, courseId: form.courseId, academicPeriodId: periodId, studentIds: [...selected] });
        toast.success(
          selected.size
            ? `Assignment created and assigned to ${selected.size} student${selected.size === 1 ? '' : 's'}.`
            : 'Assignment created. Add students from “Manage” when you are ready.',
        );
      } else {
        await courseworkService.update(assignment.id, details);
        if (selected.size) {
          const { data } = await courseworkService.addStudents(assignment.id, [...selected]);
          toast.success(`Assignment saved. ${data.added} student${data.added === 1 ? '' : 's'} added.`);
        } else {
          toast.success('Assignment saved.');
        }
      }
      onSaved?.();
    } catch (err) {
      setErrors(fieldErrorsFrom(err));
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    setRemoving(true);
    try {
      const { data } = await courseworkService.removeStudent(assignment.id, toRemove.studentId);
      // Update both lists at once: the student leaves "assigned" and can be picked again.
      assigned.setData(data.students);
      eligible.setData((list) => list?.map((s) => (s.studentId === toRemove.studentId ? { ...s, assigned: false } : s)));
      toast.success(`${toRemove.student.fullName} removed from the assignment.`);
      setToRemove(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoving(false);
    }
  };

  const busy = saving || removing;

  return (
    <>
      <Modal
        open={open}
        onClose={() => !busy && onClose()}
        size="lg"
        title={isCreate ? 'Add assignment' : 'Manage assignment'}
        description={isCreate ? 'Set the details, then choose which enrolled students can see it.' : assignment?.title}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" form="assignment-form" loading={saving} disabled={removing}>
              {isCreate ? 'Create assignment' : selected.size ? `Save and add ${selected.size}` : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="assignment-form" onSubmit={save} noValidate className="space-y-6">
          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={saving}>
            <legend className="sr-only">Assignment details</legend>
            <Input label="Assignment title" required value={form.title} onChange={set('title')} error={errors.title} maxLength={150} className="sm:col-span-2" data-autofocus />
            <Textarea
              label="Description"
              value={form.description}
              onChange={set('description')}
              error={errors.description}
              maxLength={5000}
              hint="Instructions students will see."
              className="sm:col-span-2"
            />
            {isCreate ? (
              <>
                <Select
                  label="Course"
                  required
                  value={form.courseId}
                  onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value, academicYear: '', semester: '' }))}
                  options={offerings.courses}
                  placeholder="Select a course"
                  error={errors.courseId}
                  hint={offerings.courses.length ? undefined : 'You have no course offerings to add assignments to.'}
                  className="sm:col-span-2"
                />
                <Select
                  label="Academic year"
                  required
                  value={form.academicYear}
                  onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value, semester: '' }))}
                  options={years.map((y) => ({ value: y, label: y }))}
                  placeholder={form.courseId ? 'Select a year' : 'Choose a course first'}
                  disabled={!form.courseId}
                  error={errors.academicYear}
                />
                <Select
                  label="Semester"
                  required
                  value={form.semester}
                  onChange={set('semester')}
                  options={semesters.map((s) => ({ value: String(s), label: `Semester ${s}` }))}
                  placeholder={form.academicYear ? 'Select a semester' : 'Choose a year first'}
                  disabled={!form.academicYear}
                  error={errors.semester}
                />
              </>
            ) : (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
                <span className="font-medium text-slate-900">
                  {assignment?.course.code} — {assignment?.course.name}
                </span>
                <span className="text-slate-600"> · {periodLabel(assignment?.academicPeriod)}</span>
                <p className="text-xs text-slate-500">The course and period cannot be changed after an assignment is created.</p>
              </div>
            )}
            <Input label="Due date" type="datetime-local" required value={form.dueAt} onChange={set('dueAt')} error={errors.dueAt} />
            <Input
              label="Maximum marks"
              type="number"
              min={0.01}
              max={1000}
              step="0.01"
              inputMode="decimal"
              required
              value={form.maxMarks}
              onChange={set('maxMarks')}
              error={errors.maxMarks}
            />
          </fieldset>

          {!isCreate && (
            <section aria-labelledby="assigned-heading">
              <h3 id="assigned-heading" className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Users className="h-4 w-4 text-brand-700" aria-hidden="true" />
                Assigned students
                {assigned.data && <Badge tone="brand">{assigned.data.length}</Badge>}
              </h3>
              {assigned.loading && !assigned.data ? (
                <Spinner label="Loading assigned students" className="py-6" />
              ) : assigned.error ? (
                <ErrorState message={assigned.error} onRetry={assigned.reload} />
              ) : !assigned.data?.length ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
                  No students are assigned yet. Add them below.
                </p>
              ) : (
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200" aria-label="Currently assigned students">
                  {assigned.data.map((a) => (
                    <li key={a.studentId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 text-sm">
                        <span className="block truncate font-medium text-slate-900">{a.student.fullName}</span>
                        <span className="block truncate font-mono text-xs text-slate-500">{a.student.registrationNumber}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={UserMinus}
                        onClick={() => setToRemove(a)}
                        disabled={busy}
                        aria-label={`Remove ${a.student.fullName} from this assignment`}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="picker-heading">
            <h3 id="picker-heading" className="mb-1 text-sm font-semibold text-slate-900">
              {isCreate ? 'Assigned students' : 'Add students'}
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Only students enrolled on this course for the selected period are listed. Only the students you assign can see
              the assignment.
            </p>
            {errors.studentIds && <p role="alert" className="mb-2 text-xs text-red-700">{errors.studentIds}</p>}
            {isCreate && !periodId ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                Choose the course, academic year and semester to see enrolled students.
              </p>
            ) : (
              <StudentPicker
                candidates={candidates}
                selected={selected}
                onChange={setSelected}
                loading={eligible.loading}
                error={eligible.error}
                onRetry={eligible.reload}
                disabled={saving}
                emptyMessage={
                  isCreate || !(eligible.data || []).length
                    ? 'No students are enrolled on this course for the selected period.'
                    : 'Every enrolled student is already assigned.'
                }
              />
            )}
          </section>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toRemove}
        onClose={() => !removing && setToRemove(null)}
        onConfirm={confirmRemove}
        loading={removing}
        title="Remove student from assignment?"
        confirmLabel="Remove"
        message={
          toRemove && (
            <>
              <strong className="font-medium text-slate-900">{toRemove.student.fullName}</strong> ({toRemove.student.registrationNumber})
              will no longer see or be able to access this assignment. Their account, enrollment and results are not affected.
            </>
          )
        }
      />
    </>
  );
}
