import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Keep the key and logic in sync with the inline script in index.html (applied before paint).
export const THEME_STORAGE_KEY = 'rems-theme';
const PREFERENCES = ['light', 'dark', 'system'];

const ThemeContext = createContext(null);

function readPreference() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return PREFERENCES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

const systemPrefersDark = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setPreference = useCallback((next) => {
    if (!PREFERENCES.includes(next)) return;
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode): the choice lasts for this page only */
    }
  }, []);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
