import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { queryClient } from '../lib/api/queryClient';
import { UNAUTHORIZED_EVENT } from '../lib/api/axios';
import { Toaster } from '../components/ui/Toaster';

/** Clears cached server data when the session ends (401 from any request). */
function SessionWatcher() {
  const navigate = useNavigate();

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionWatcher />
        {children}
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
