import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw, UserMinus, UserPlus, Users } from 'lucide-react';
import { DataTable } from '../../components/DataTable.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { CoursePeriodPicker } from '../../components/CoursePeriodPicker.jsx';
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
} from '../../components/ui/index.js';
import { enrollmentsService, studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useListQuery, useDebounce } from '../../hooks/useListQuery.js';
import { useOptions } from '../../hooks/useOptions.js';
import { useToast } from '../../contexts/ToastContext.jsx';

function EnrollModal({ open, onClose, courseId, periodId, onDone }) {
  const toast = useToast();
  const { programmes } = useOptions(['programmes']);
  const [mode, setMode] = useState('pick');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const [selected, setSelected] = useState(new Set());
  const [cohort, setCohort] = useState({ programmeId: '', yearOfStudy: '' });
  const [saving, setSaving] = useState(false);
  const students = useApi(
    () => studentsService.list({ search: debounced, pageSize: 25, accountStatus: 'active' }),
    [debounced],
    { enabled: open && mode === 'pick' },
  );

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSearch('');
      setCohort({ programmeId: '', yearOfStudy: '' });
    }
  }, [open]);

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    const body = { courseId, academicPeriodId: periodId };
    if (mode === 'pick') {
      if (!selected.size) return toast.error('Select at least one student.');
      body.studentIds = [...selected];
    } else {
      if (!cohort.programmeId || !cohort.yearOfStudy) return toast.error('Choose a programme and year of study.');
      body.programmeId = cohort.programmeId;
      body.yearOfStudy = Number(cohort.yearOfStudy);
    }
    setSaving(true);
    try {
      const { data } = await enrollmentsService.bulk(body);
      toast.success(`${data.created} student(s) enrolled${data.skipped ? `, ${data.skipped} already enrolled` : ''}.`);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enroll students"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={UserPlus}>
            {mode === 'pick' ? `Enroll ${selected.size || ''} selected` : 'Enroll cohort'}
          </Button>
        </>
      }
    >
      <div role="tablist" aria-label="Enrollment method" className="mb-4 inline-flex rounded-lg bg-slate-100 p-1">
        {[
          ['pick', 'Select students'],
          ['cohort', 'Whole cohort'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === key ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'pick' ? (
        <div>
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or registration number…" />
          <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {(students.data || []).map((s) => (
              <li key={s.id} className="px-3 py-2.5">
                <Checkbox
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  label={s.fullName}
                  description={`${s.registrationNumber} · ${s.programme?.code || ''} · Year ${s.yearOfStudy}`}
                />
              </li>
            ))}
            {!students.loading && !students.data?.length && (
              <li className="px-3 py-6 text-center text-sm text-slate-500">No active students match.</li>
            )}
          </ul>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Programme"
            value={cohort.programmeId}
            onChange={(e) => setCohort((c) => ({ ...c, programmeId: e.target.value }))}
            options={programmes}
            placeholder="Select programme"
          />
          <Select
            label="Year of study"
            value={cohort.yearOfStudy}
            onChange={(e) => setCohort((c) => ({ ...c, yearOfStudy: e.target.value }))}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map((y) => ({ value: String(y), label: `Year ${y}` }))}
            placeholder="Select year"
          />
          <p className="text-xs text-slate-500 sm:col-span-2">
            All active students on this programme and year will be enrolled. Students already enrolled are skipped.
          </p>
        </div>
      )}
    </Modal>
  );
}

export default function EnrollmentsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const courseId = params.get('course') || '';
  const periodId = params.get('period') || '';
  const { courses, periods } = useOptions(['courses', 'periods']);
  const q = useListQuery({ pageSize: 25 });
  const ready = Boolean(courseId && periodId);
  const list = useApi(
    () => enrollmentsService.forCourse(courseId, { ...q.params, academicPeriodId: periodId }),
    [courseId, periodId, JSON.stringify(q.params)],
    { enabled: ready },
  );
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [toChange, setToChange] = useState(null);
  const [changing, setChanging] = useState(false);

  const changeStatus = async () => {
    setChanging(true);
    try {
      const next = toChange.enrollmentStatus === 'withdrawn' ? 'enrolled' : 'withdrawn';
      await enrollmentsService.update(toChange.id, { enrollmentStatus: next });
      toast.success(next === 'withdrawn' ? 'Student withdrawn from course.' : 'Enrollment reinstated.');
      setToChange(null);
      list.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChanging(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Enrollments"
        description="Register students on courses for a given academic period."
        actions={ready && <Button icon={UserPlus} onClick={() => setEnrollOpen(true)}>Enroll students</Button>}
      />
      <Card className="mb-4">
        <CoursePeriodPicker
          courses={courses}
          periods={periods}
          courseId={courseId}
          periodId={periodId}
          onChange={({ courseId: c, periodId: p }) => setParams({ ...(c && { course: c }), ...(p && { period: p }) })}
        />
      </Card>

      <Card bodyClassName="">
        {!ready ? (
          <EmptyState icon={Users} title="Choose a course and period" message="Enrolled students will be listed here." />
        ) : (
          <>
            <div className="border-b border-slate-200 p-4">
              <SearchInput value={q.search} onChange={q.setSearch} placeholder="Search enrolled students…" className="sm:max-w-xs" />
            </div>
            <DataTable
              caption="Enrolled students"
              columns={[
                { key: 'reg', header: 'Reg. number', className: 'font-mono text-xs', render: (r) => r.student?.registrationNumber },
                { key: 'name', header: 'Name', render: (r) => r.student?.fullName },
                { key: 'programme', header: 'Programme', render: (r) => r.student?.programme?.code || '—' },
                { key: 'enrollmentStatus', header: 'Enrollment', render: (r) => <StatusBadge status={r.enrollmentStatus} /> },
                { key: 'result', header: 'Result', render: (r) => <StatusBadge status={r.result?.publicationStatus || null} /> },
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right',
                  render: (r) =>
                    r.enrollmentStatus === 'withdrawn' ? (
                      <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setToChange(r)}>Reinstate</Button>
                    ) : (
                      <Button variant="ghost" size="sm" icon={UserMinus} onClick={() => setToChange(r)} disabled={!!r.result && r.result.publicationStatus !== 'draft'}>
                        Withdraw
                      </Button>
                    ),
                },
              ]}
              rows={list.data || []}
              loading={list.loading}
              error={list.error}
              onRetry={list.reload}
              emptyTitle="No students enrolled"
              emptyMessage="Use “Enroll students” to add students to this course."
              footer={<Pagination page={q.page} pageSize={q.pageSize} total={list.meta?.total || 0} onPageChange={q.setPage} />}
            />
          </>
        )}
      </Card>

      <EnrollModal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        courseId={courseId}
        periodId={periodId}
        onDone={() => {
          setEnrollOpen(false);
          list.reload();
        }}
      />
      <ConfirmDialog
        open={!!toChange}
        onClose={() => setToChange(null)}
        onConfirm={changeStatus}
        loading={changing}
        tone={toChange?.enrollmentStatus === 'withdrawn' ? 'primary' : 'danger'}
        title={toChange?.enrollmentStatus === 'withdrawn' ? 'Reinstate enrollment?' : 'Withdraw student?'}
        confirmLabel={toChange?.enrollmentStatus === 'withdrawn' ? 'Reinstate' : 'Withdraw'}
        message={`${toChange?.student?.fullName} (${toChange?.student?.registrationNumber})`}
      />
    </>
  );
}
