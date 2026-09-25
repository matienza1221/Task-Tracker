import { create } from 'zustand';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '../lib/theme';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

/**
 * Client-only UI state. Server data lives in TanStack Query — never here
 * (ARCHITECTURE.md §9.1).
 */
export const useUiStore = create<UiState>((set) => ({
  theme: readStoredTheme(),
  sidebarCollapsed: false,
  mobileNavOpen: false,
  setTheme: (theme) => {
    storeTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));

/** Applies the stored theme on startup (called from main.tsx). */
export function initializeTheme(): void {
  applyTheme(useUiStore.getState().theme);
}
