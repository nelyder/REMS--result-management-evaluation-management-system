import { CrudPage } from '../../components/CrudPage.jsx';
import { programmesService } from '../../services/index.js';
import { useOptions } from '../../hooks/useOptions.js';

export default function ProgrammesPage() {
  const { departments } = useOptions(['departments']);
  return (
    <CrudPage
      title="Programmes"
      description="Degree and diploma programmes students are registered on."
      entityName="programme"
      service={programmesService}
      canDelete
      defaultSort={{ key: 'code', order: 'asc' }}
      filters={[{ name: 'departmentId', label: 'Departments', options: departments }]}
      columns={[
        { key: 'code', header: 'Code', sortable: true, className: 'font-mono text-xs' },
        { key: 'name', header: 'Programme', sortable: true },
        { key: 'department', header: 'Department', render: (r) => r.department?.name || '—' },
      ]}
      fields={[
        { name: 'code', label: 'Programme code', required: true, placeholder: 'BSC-CS' },
        { name: 'departmentId', label: 'Department', type: 'select', options: departments, required: true },
        { name: 'name', label: 'Programme name', required: true, full: true, placeholder: 'BSc Computer Science' },
      ]}
      initialValues={{ code: '', name: '', departmentId: '' }}
      toForm={(r) => ({ code: r.code, name: r.name, departmentId: r.departmentId })}
      toPayload={(v) => ({ code: v.code.trim().toUpperCase(), name: v.name.trim(), departmentId: v.departmentId })}
    />
  );
}
