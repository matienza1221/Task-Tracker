export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'teamboard-theme';

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

export const THEME_TRANSITION_CLASS = 'theme-transition';
const THEME_TRANSITION_MS = 250;

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Runs `apply` with a short cross-fade enabled on the document so switching
 * themes eases instead of snapping. The class is removed again afterwards so
 * normal interactions keep their own transitions.
 */
export function withThemeTransition(apply: () => void): void {
  const root = document.documentElement;
  root.classList.add(THEME_TRANSITION_CLASS);
  apply();
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.classList.remove(THEME_TRANSITION_CLASS), THEME_TRANSITION_MS);
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
