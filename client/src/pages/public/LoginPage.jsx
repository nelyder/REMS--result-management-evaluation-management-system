import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, GraduationCap, LogIn, ShieldCheck } from 'lucide-react';
import { Button, Input } from '../../components/ui/index.js';
import { homePathForRole, useAuth } from '../../contexts/AuthContext.jsx';
import { isSupabaseConfigured } from '../../services/supabase.js';
import { ThemeToggle } from '../../components/ThemeToggle.jsx';

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathForRole(user.role)} replace />;

  const validate = () => {
    const next = {};
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address';
    if (!form.password) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const profile = await signIn(form.email.trim(), form.password);
      const from = location.state?.from;
      const home = homePathForRole(profile.role);
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setSubmitError(err.status === 403 ? 'This account is inactive. Contact the registry office.' : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-800 p-12 text-on-brand lg:flex dark:border-r dark:border-slate-200 dark:bg-brand-50 dark:text-slate-900">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-on-brand/10 p-2 dark:bg-brand-100">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold">REMS</span>
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">Result Evaluation and Management System</h2>
          <p className="mt-4 max-w-md text-brand-100 dark:text-slate-600">
            Accurate marks entry, consistent grading, and secure access to published results for
            administrators, lecturers, and students.
          </p>
        </div>
        <p className="flex items-center gap-2 text-sm text-brand-200 dark:text-slate-500">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Access is restricted to authorised university accounts.
        </p>
      </div>

      <div className="relative flex items-center justify-center px-4 py-12 sm:px-6">
        <ThemeToggle compact className="absolute right-4 top-4" />
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <GraduationCap className="h-7 w-7 text-brand-700" aria-hidden="true" />
            <span className="text-lg font-bold">REMS</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use the account issued by your institution.</p>

          {!isSupabaseConfigured && (
            <div role="alert" className="mt-6 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Authentication is not configured. Copy <code>client/.env.example</code> to <code>client/.env</code> and set your Supabase URL and publishable key.
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            {location.state?.notice && !submitError && (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {location.state.notice}
              </div>
            )}
            {submitError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {submitError}
              </div>
            )}
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={update('password')}
              error={errors.password}
              required
            />
            <div className="-mt-1 text-right">
              <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" loading={submitting} icon={LogIn}>
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-xs text-slate-500">
            Need an account? Contact the academic registry. Accounts are created by administrators only.
          </p>
        </div>
      </div>
    </div>
  );
}
