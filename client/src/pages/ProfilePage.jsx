import { Card, PageHeader, StatusBadge } from '../components/ui/index.js';
import { ChangePasswordForm } from '../components/ChangePasswordForm.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { formatDate, titleCase } from '../utils/format.js';

function Row({ label, children }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900 sm:col-span-2">{children || '—'}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const s = user.student;
  const l = user.lecturer;
  return (
    <>
      <PageHeader title="My profile" description="Your account details as recorded by the registry." />
      <Card title="Account">
        <dl className="divide-y divide-slate-100">
          <Row label="Full name">{user.fullName}</Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Role">{titleCase(user.role)}</Row>
          <Row label="Account status"><StatusBadge status={user.accountStatus} /></Row>
          <Row label="Member since">{formatDate(user.createdAt)}</Row>
          {s && (
            <>
              <Row label="Registration number">{s.registrationNumber}</Row>
              <Row label="Programme">{s.programme ? `${s.programme.code} — ${s.programme.name}` : null}</Row>
              <Row label="Year of study">{s.yearOfStudy}</Row>
            </>
          )}
          {l && (
            <>
              <Row label="Staff number">{l.staffNumber}</Row>
              <Row label="Department">{l.department ? `${l.department.code} — ${l.department.name}` : null}</Row>
            </>
          )}
        </dl>
      </Card>
      <p className="mt-4 text-xs text-slate-500">
        To correct your personal details, contact the academic registry. Profile and role changes can only be made by administrators.
      </p>
      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </>
  );
}
