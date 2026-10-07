import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/Providers';
import { AppRoutes } from './app/AppRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initializeTheme } from './stores/uiStore';
import { watchSystemTheme } from './lib/theme';
import { useUiStore } from './stores/uiStore';
import './styles/index.css';

initializeTheme();
watchSystemTheme(() => useUiStore.getState().theme);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </AppProviders>
  </StrictMode>,
);
