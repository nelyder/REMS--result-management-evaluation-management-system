import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full bg-slate-100 p-4">
        <FileQuestion className="h-8 w-8 text-slate-500" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you’re looking for doesn’t exist or has moved.</p>
      <Link to="/" className="mt-6 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
        Go home
      </Link>
    </div>
  );
}
