import { CrudPage } from '../../components/CrudPage.jsx';
import { coursesService } from '../../services/index.js';
import { useOptions } from '../../hooks/useOptions.js';

export default function CoursesPage() {
  const { departments } = useOptions(['departments']);
  return (
    <CrudPage
      title="Courses"
      description="Course catalogue. Leave the pass mark empty to use the institution default."
      entityName="course"
      service={coursesService}
      defaultSort={{ key: 'code', order: 'asc' }}
      filters={[{ name: 'departmentId', label: 'Departments', options: departments }]}
      columns={[
        { key: 'code', header: 'Code', sortable: true, className: 'font-mono text-xs' },
        { key: 'name', header: 'Course', sortable: true },
        { key: 'creditUnits', header: 'Credits', sortable: true, align: 'center' },
        { key: 'department', header: 'Department', render: (r) => r.department?.code || '—' },
        { key: 'passMark', header: 'Pass mark', align: 'center', render: (r) => r.passMark ?? <span className="text-slate-400">Default</span> },
      ]}
      fields={[
        { name: 'code', label: 'Course code', required: true, placeholder: 'CSC 201' },
        { name: 'departmentId', label: 'Department', type: 'select', options: departments, required: true },
        { name: 'name', label: 'Course name', required: true, full: true },
        { name: 'creditUnits', label: 'Credit units', type: 'number', min: 1, max: 30, required: true },
        { name: 'passMark', label: 'Pass mark (optional)', type: 'number', min: 0, max: 100, step: '0.5', hint: 'Overrides the default pass mark for this course.' },
      ]}
      initialValues={{ code: '', name: '', departmentId: '', creditUnits: '3', passMark: '' }}
      toForm={(r) => ({
        code: r.code,
        name: r.name,
        departmentId: r.departmentId,
        creditUnits: String(r.creditUnits),
        passMark: r.passMark ?? '',
      })}
      validate={(v) => {
        const e = {};
        const cu = Number(v.creditUnits);
        if (!Number.isInteger(cu) || cu < 1 || cu > 30) e.creditUnits = 'Enter a whole number from 1 to 30';
        if (v.passMark !== '' && (Number(v.passMark) < 0 || Number(v.passMark) > 100)) e.passMark = 'Must be between 0 and 100';
        return e;
      }}
      toPayload={(v) => ({
        code: v.code.trim().toUpperCase(),
        name: v.name.trim(),
        departmentId: v.departmentId,
        creditUnits: Number(v.creditUnits),
        passMark: v.passMark === '' ? null : Number(v.passMark),
      })}
    />
  );
}
