import { create } from 'zustand';
import { applyTheme, readStoredTheme, storeTheme, withThemeTransition, type Theme } from '../lib/theme';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

const SIDEBAR_STORAGE_KEY = 'teamboard-sidebar-collapsed';

function readStoredSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeSidebar(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

/**
 * Client-only UI state. Server data lives in TanStack Query — never here
 * (ARCHITECTURE.md §9.1).
 */
export const useUiStore = create<UiState>((set) => ({
  theme: readStoredTheme(),
  sidebarCollapsed: readStoredSidebar(),
  mobileNavOpen: false,
  setTheme: (theme) => {
    storeTheme(theme);
    withThemeTransition(() => applyTheme(theme));
    set({ theme });
  },
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      storeSidebar(sidebarCollapsed);
      return { sidebarCollapsed };
    }),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));

/** Applies the stored theme on startup (called from main.tsx). */
export function initializeTheme(): void {
  applyTheme(useUiStore.getState().theme);
}
