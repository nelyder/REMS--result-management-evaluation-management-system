import { CrudPage } from '../../components/CrudPage.jsx';
import { AccountStatusAction } from '../../components/AccountStatusAction.jsx';
import { StatusBadge } from '../../components/ui/index.js';
import { lecturersService } from '../../services/index.js';
import { useOptions } from '../../hooks/useOptions.js';

export default function LecturersPage() {
  const { departments } = useOptions(['departments']);

  return (
    <CrudPage
      title="Lecturers"
      description="Create and manage lecturer accounts."
      entityName="lecturer"
      service={lecturersService}
      searchPlaceholder="Search by name, email or staff no…"
      defaultSort={{ key: 'fullName', order: 'asc' }}
      filters={[{ name: 'departmentId', label: 'Departments', options: departments }]}
      columns={[
        { key: 'staffNumber', header: 'Staff no.', sortable: true, className: 'font-mono text-xs' },
        {
          key: 'fullName',
          header: 'Name',
          sortable: true,
          render: (r) => (
            <div>
              <p className="font-medium text-slate-900">{r.fullName}</p>
              <p className="text-xs text-slate-500">{r.email}</p>
            </div>
          ),
        },
        { key: 'department', header: 'Department', render: (r) => r.department?.name || '—' },
        { key: 'assignedCourses', header: 'Courses', align: 'center', render: (r) => r.assignedCourses ?? 0 },
        { key: 'accountStatus', header: 'Status', render: (r) => <StatusBadge status={r.accountStatus} /> },
      ]}
      fields={[
        { name: 'fullName', label: 'Full name', required: true, full: true },
        { name: 'email', label: 'Email', type: 'email', required: true, readOnlyOnEdit: true },
        { name: 'staffNumber', label: 'Staff number', required: true, placeholder: 'STF/0001' },
        { name: 'departmentId', label: 'Department', type: 'select', options: departments, required: true },
        {
          name: 'password',
          label: 'Temporary password',
          type: 'password',
          required: true,
          createOnly: true,
          autoComplete: 'new-password',
          hint: 'At least 10 characters.',
        },
      ]}
      initialValues={{ fullName: '', email: '', staffNumber: '', departmentId: '', password: '' }}
      toForm={(r) => ({ fullName: r.fullName, email: r.email, staffNumber: r.staffNumber, departmentId: r.departmentId })}
      toPayload={(v, mode) => {
        const body = { fullName: v.fullName.trim(), staffNumber: v.staffNumber.trim(), departmentId: v.departmentId };
        if (mode === 'create') Object.assign(body, { email: v.email.trim(), password: v.password });
        return body;
      }}
      validate={(v, mode) =>
        mode === 'create' && v.password && v.password.length < 10 ? { password: 'Use at least 10 characters' } : {}
      }
      rowActions={(row, { reload }) => (
        <AccountStatusAction profileId={row.profileId} name={row.fullName} status={row.accountStatus} onChanged={reload} />
      )}
    />
  );
}
