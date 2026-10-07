export type Theme = 'light' | 'dark';

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
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable */
  }
  // First visit: match the OS once, after that the choice is explicit.
  return prefersDark() ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
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
