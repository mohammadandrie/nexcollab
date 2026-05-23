import { useEffect, useState } from 'react';

const KEY_THEME = 'nexcollab.theme';

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(KEY_THEME, t);
}

export function loadInitialTheme() {
  const saved = localStorage.getItem(KEY_THEME);
  const sys = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const t = saved || sys;
  document.documentElement.setAttribute('data-theme', t);
  return t;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  useEffect(() => { applyTheme(theme); }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="text-[11px] theme-muted hover:opacity-80 bg-transparent
                 border border-[color:var(--border)] rounded-full px-2.5 py-1">
      {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
    </button>
  );
}
