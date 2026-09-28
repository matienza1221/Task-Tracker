import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    useUiStore.setState({ theme: 'system', sidebarCollapsed: false, mobileNavOpen: false });
  });

  it('stores the theme and applies it to the document', () => {
    useUiStore.getState().setTheme('dark');
    expect(useUiStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('teamboard-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    useUiStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggles the sidebar and mobile navigation independently of server state', () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    useUiStore.getState().setMobileNavOpen(true);
    expect(useUiStore.getState().mobileNavOpen).toBe(true);
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });
});
