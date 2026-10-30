import { GraduationCap } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle.jsx';

/** Centered single-card layout for public account pages (forgot / reset password). */
export function AuthLayout({ title, description, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <ThemeToggle compact className="absolute right-4 top-4" />
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-2">
          <GraduationCap className="h-7 w-7 text-brand-700" aria-hidden="true" />
          <span className="text-lg font-bold text-slate-900">REMS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
