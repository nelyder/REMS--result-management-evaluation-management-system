import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { CrudPage } from '../../components/CrudPage.jsx';
import { AccountStatusAction } from '../../components/AccountStatusAction.jsx';
import { StatusBadge } from '../../components/ui/index.js';
import { studentsService } from '../../services/index.js';
import { useOptions } from '../../hooks/useOptions.js';

const YEARS = [1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }));

export default function StudentsPage() {
  const { programmes } = useOptions(['programmes']);

  return (
    <CrudPage
      title="Students"
      description="Create and manage student accounts and academic details."
      entityName="student"
      service={studentsService}
      searchPlaceholder="Search by name, email or registration no…"
      defaultSort={{ key: 'registrationNumber', order: 'asc' }}
      filters={[
        { name: 'programmeId', label: 'Programmes', options: programmes },
        { name: 'yearOfStudy', label: 'Years', options: YEARS },
        { name: 'accountStatus', label: 'Statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      ]}
      columns={[
        { key: 'registrationNumber', header: 'Reg. number', sortable: true, className: 'font-mono text-xs' },
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
        { key: 'programme', header: 'Programme', render: (r) => r.programme?.code || '—' },
        { key: 'yearOfStudy', header: 'Year', sortable: true, align: 'center' },
        { key: 'accountStatus', header: 'Status', render: (r) => <StatusBadge status={r.accountStatus} /> },
      ]}
      fields={[
        { name: 'fullName', label: 'Full name', required: true, full: true },
        { name: 'email', label: 'Email', type: 'email', required: true, readOnlyOnEdit: true, hint: 'Used to sign in.' },
        { name: 'registrationNumber', label: 'Registration number', required: true, placeholder: 'REG/2024/0001' },
        { name: 'programmeId', label: 'Programme', type: 'select', options: programmes, required: true },
        { name: 'yearOfStudy', label: 'Year of study', type: 'select', options: YEARS, required: true },
        {
          name: 'password',
          label: 'Temporary password',
          type: 'password',
          required: true,
          createOnly: true,
          autoComplete: 'new-password',
          hint: 'At least 10 characters. Share it securely; the student should change it after first sign-in.',
        },
      ]}
      initialValues={{ fullName: '', email: '', registrationNumber: '', programmeId: '', yearOfStudy: '1', password: '' }}
      toForm={(r) => ({
        fullName: r.fullName,
        email: r.email,
        registrationNumber: r.registrationNumber,
        programmeId: r.programmeId,
        yearOfStudy: String(r.yearOfStudy),
      })}
      toPayload={(v, mode) => {
        const body = {
          fullName: v.fullName.trim(),
          registrationNumber: v.registrationNumber.trim(),
          programmeId: v.programmeId,
          yearOfStudy: Number(v.yearOfStudy),
        };
        if (mode === 'create') Object.assign(body, { email: v.email.trim(), password: v.password });
        return body;
      }}
      validate={(v, mode) =>
        mode === 'create' && v.password && v.password.length < 10 ? { password: 'Use at least 10 characters' } : {}
      }
      rowActions={(row, { reload }) => (
        <>
          <Link
            to={`/admin/students/${row.id}/statement`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label={`Result statement for ${row.fullName}`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" /> Statement
          </Link>
          <AccountStatusAction profileId={row.profileId} name={row.fullName} status={row.accountStatus} onChanged={reload} />
        </>
      )}
    />
  );
}
