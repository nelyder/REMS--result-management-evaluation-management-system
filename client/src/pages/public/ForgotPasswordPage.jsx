import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button, Input } from '../../components/ui/index.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(email.trim() ? 'Enter a valid email address' : 'Email is required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" description="We'll email you a link to choose a new password.">
      {sent ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way. The link expires after a short
          time; check your spam folder if it doesn't arrive.
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {submitError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{submitError}</div>
          )}
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
            required
          />
          <Button type="submit" className="w-full" icon={Mail} loading={submitting}>Send reset link</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
      </Link>
    </AuthLayout>
  );
}
