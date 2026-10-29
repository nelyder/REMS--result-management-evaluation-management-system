import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { homePathForRole, useAuth } from '../../contexts/AuthContext.jsx';

export default function UnauthorizedPage() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full bg-red-100 p-4">
        <ShieldAlert className="h-8 w-8 text-red-600" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-semibold text-red-700">403 — Access denied</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">You don’t have permission to view this page</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        If you believe this is a mistake, contact your system administrator.
      </p>
      <Link
        to={user ? homePathForRole(user.role) : '/login'}
        className="mt-6 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
      >
        {user ? 'Back to dashboard' : 'Go to sign in'}
      </Link>
    </div>
  );
}
