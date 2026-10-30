import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { GraduationCap, LogOut, Menu, UserCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { navigation } from './navigation.js';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { titleCase } from '../utils/format.js';

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="rounded-lg bg-brand-700 p-1.5">
        <GraduationCap className="h-5 w-5 text-on-brand" aria-hidden="true" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-slate-900">REMS</p>
        <p className="text-[11px] text-slate-500">Result Management</p>
      </div>
    </div>
  );
}

function NavItems({ role, onNavigate }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {(navigation[role] || []).map((group) => (
        <div key={group.section}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.section}</p>
          <ul className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBox({ user, onSignOut }) {
  return (
    <div className="border-t border-slate-200 p-3">
      <ThemeToggle className="mb-2 w-full justify-between" />
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <UserCircle className="h-8 w-8 shrink-0 text-slate-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
          <p className="truncate text-xs text-slate-500">{titleCase(user.role)}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-surface lg:flex">
        <Brand />
        <NavItems role={user.role} />
        <UserBox user={user} onSignOut={signOut} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-surface px-4 py-2 lg:hidden">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <span className="text-sm font-bold">REMS</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems role={user.role} onNavigate={() => setMobileOpen(false)} />
            <UserBox user={user} onSignOut={signOut} />
          </div>
        </div>
      )}

      <main id="main" className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
