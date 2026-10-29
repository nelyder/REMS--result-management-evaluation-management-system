import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, Card, Input } from './ui/index.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { PASSWORD_MIN, validateNewPassword } from '../utils/password.js';

const EMPTY = { current: '', password: '', confirm: '' };

export function ChangePasswordForm() {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const next = validateNewPassword(form.password, form.confirm);
    if (!form.current) next.current = 'Enter your current password';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await changePassword(form.current, form.password);
      setForm(EMPTY);
      toast.success('Password changed.');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Card title="Change password" description={`Use at least ${PASSWORD_MIN} characters. Temporary passwords issued by the registry should be changed after first sign-in.`}>
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        {submitError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{submitError}</div>
        )}
        <Input label="Current password" type="password" autoComplete="current-password" value={form.current} onChange={update('current')} error={errors.current} required />
        <Input label="New password" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} error={errors.password} required />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} error={errors.confirm} required />
        <Button type="submit" icon={KeyRound} loading={submitting}>Change password</Button>
      </form>
    </Card>
  );
}
