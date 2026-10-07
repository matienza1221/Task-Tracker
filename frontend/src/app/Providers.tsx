import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { queryClient } from '../lib/api/queryClient';
import { UNAUTHORIZED_EVENT } from '../lib/api/axios';
import { Toaster } from '../components/ui/Toaster';
import { toast } from '../stores/toastStore';

const AUTH_PATHS = ['/login', '/forgot-password', '/reset-password'];

/** Clears cached server data when the session ends (401 from any request). */
function SessionWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.clear();
      const { pathname, search } = locationRef.current;
      // Already on an auth screen: nothing to redirect to (avoids loops).
      if (AUTH_PATHS.some((path) => pathname.startsWith(path))) return;
      toast.error('Session expired', 'Please sign in again to continue.');
      navigate('/login', {
        replace: true,
        state: { from: `${pathname}${search}`, reason: 'expired' },
      });
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
