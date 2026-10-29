import { CrudPage } from '../../components/CrudPage.jsx';
import { StatusBadge } from '../../components/ui/index.js';
import { periodsService } from '../../services/index.js';
import { formatDate } from '../../utils/format.js';

const STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

export default function AcademicPeriodsPage() {
  return (
    <CrudPage
      title="Academic periods"
      description="Academic years and semesters. Results are always recorded against a period."
      entityName="academic period"
      service={periodsService}
      searchPlaceholder="Search by academic year…"
      defaultSort={{ key: 'startDate', order: 'desc' }}
      filters={[{ name: 'status', label: 'Statuses', options: STATUSES }]}
      columns={[
        { key: 'academicYear', header: 'Academic year', sortable: true, className: 'font-medium' },
        { key: 'semester', header: 'Semester', align: 'center' },
        { key: 'startDate', header: 'Starts', sortable: true, render: (r) => formatDate(r.startDate) },
        { key: 'endDate', header: 'Ends', render: (r) => formatDate(r.endDate) },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'academicYear', label: 'Academic year', required: true, placeholder: '2025/2026', hint: 'Format YYYY/YYYY' },
        { name: 'semester', label: 'Semester', type: 'select', required: true, options: [1, 2, 3].map((s) => ({ value: String(s), label: `Semester ${s}` })) },
        { name: 'startDate', label: 'Start date', type: 'date', required: true },
        { name: 'endDate', label: 'End date', type: 'date', required: true },
        { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES, placeholder: undefined },
      ]}
      initialValues={{ academicYear: '', semester: '1', startDate: '', endDate: '', status: 'planned' }}
      toForm={(r) => ({ ...r, semester: String(r.semester) })}
      validate={(v) => {
        const e = {};
        const m = /^(\d{4})\/(\d{4})$/.exec(v.academicYear.trim());
        if (!m || Number(m[2]) !== Number(m[1]) + 1) e.academicYear = 'Use consecutive years, e.g. 2025/2026';
        if (v.startDate && v.endDate && v.endDate <= v.startDate) e.endDate = 'End date must be after the start date';
        return e;
      }}
      toPayload={(v) => ({
        academicYear: v.academicYear.trim(),
        semester: Number(v.semester),
        startDate: v.startDate,
        endDate: v.endDate,
        status: v.status,
      })}
    />
  );
}
