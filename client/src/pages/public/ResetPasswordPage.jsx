import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Button, Input, Spinner } from '../../components/ui/index.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { recoveryLink } from '../../services/supabase.js';
import { PASSWORD_MIN, validateNewPassword } from '../../utils/password.js';

/** Landing page for the Supabase password-reset email link. */
export default function ResetPasswordPage() {
  const { loading, recovery, setNewPassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Spinner className="min-h-screen" />;

  // Only a recovery session (from the emailed link) may set a password without the old one.
  if (!recovery) {
    return (
      <AuthLayout title="Link not valid" description={recoveryLink.error || 'This reset link is invalid or has expired.'}>
        <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Request a new link</Link>
      </AuthLayout>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const next = validateNewPassword(form.password, form.confirm);
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await setNewPassword(form.password);
      await signOut();
      navigate('/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } });
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  };

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <AuthLayout title="Choose a new password" description={`Use at least ${PASSWORD_MIN} characters.`}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {submitError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{submitError}</div>
        )}
        <Input label="New password" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} error={errors.password} required />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} error={errors.confirm} required />
        <Button type="submit" className="w-full" icon={KeyRound} loading={submitting}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
