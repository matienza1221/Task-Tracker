export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'tracker-theme';

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* localStorage unavailable */
  }
  return 'system';
}

export function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Re-applies the theme when the OS preference changes (only affects 'system'). */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (getTheme() === 'system') applyTheme('system');
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  } catch {
    return () => undefined;
  }
}
