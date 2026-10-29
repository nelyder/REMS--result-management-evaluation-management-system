import { CrudPage } from '../../components/CrudPage.jsx';
import { departmentsService } from '../../services/index.js';

export default function DepartmentsPage() {
  return (
    <CrudPage
      title="Departments"
      description="Academic departments that own programmes, courses and staff."
      entityName="department"
      service={departmentsService}
      canDelete
      defaultSort={{ key: 'code', order: 'asc' }}
      columns={[
        { key: 'code', header: 'Code', sortable: true, className: 'font-mono text-xs' },
        { key: 'name', header: 'Department', sortable: true },
      ]}
      fields={[
        { name: 'code', label: 'Department code', required: true, placeholder: 'CSC' },
        { name: 'name', label: 'Department name', required: true, placeholder: 'Computer Science' },
      ]}
      initialValues={{ code: '', name: '' }}
      toForm={(r) => ({ code: r.code, name: r.name })}
      toPayload={(v) => ({ code: v.code.trim().toUpperCase(), name: v.name.trim() })}
    />
  );
}
