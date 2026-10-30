import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Light / dark / system switch. `compact` shows icons only (labels stay available to screen readers). */
export function ThemeToggle({ compact = false, className = '' }) {
  const { preference, setPreference } = useTheme();
  return (
    <div role="group" aria-label="Colour theme" className={`inline-flex rounded-lg bg-slate-100 p-0.5 ${className}`}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            title={`${label} theme`}
            onClick={() => setPreference(value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              active ? 'bg-surface text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={compact ? 'sr-only' : undefined}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
