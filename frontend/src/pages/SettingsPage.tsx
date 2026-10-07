import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ArrowRightIcon } from '../components/ui/icons';
import { useLogout, useMe } from '../features/auth/queries';
import { cn } from '../lib/cn';
import { formatDateTime, formatRole } from '../lib/format';
import { toast } from '../stores/toastStore';
import { useUiStore } from '../stores/uiStore';
import type { Theme } from '../lib/theme';

const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Use the light theme.' },
  { value: 'dark', label: 'Dark', description: 'Use the dark theme.' },
];

export function SettingsPage() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const [signingOut, setSigningOut] = useState(false);

  const user = me.data;

  const handleSignOut = () => {
    setSigningOut(true);
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success('Signed out');
        navigate('/login', { replace: true });
      },
      onError: (error) => {
        setSigningOut(false);
        toast.error('Could not sign out', error.message);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Profile information and application preferences.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Profile"
          description="Managed by administrators — contact an admin to change your name or role."
          actions={user && <Badge variant="indigo">{formatRole(user.globalRole)}</Badge>}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Display name
            </p>
            <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">{user?.displayName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Email</p>
            <p className="mt-1 truncate text-sm text-slate-900 dark:text-slate-100">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Timezone</p>
            <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">{user?.timezone ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Last sign-in
            </p>
            <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">{formatDateTime(user?.lastLoginAt)}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Appearance" description="Choose how the interface looks." />
        <CardBody>
          <fieldset>
            <legend className="sr-only">Theme</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors',
                    theme === option.value
                      ? 'border-indigo-500 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/40'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="theme"
                      value={option.value}
                      checked={theme === option.value}
                      onChange={() => setTheme(option.value)}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{option.label}</span>
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Security" description="Password and session management." />
        <CardBody className="space-y-4">
          {user?.mustChangePassword && (
            <Alert variant="warning" title="Password change required">
              You are still using a temporary password.
            </Alert>
          )}
          <Link
            to="/change-password"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Change password <ArrowRightIcon className="text-sm" />
          </Link>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button variant="secondary" onClick={handleSignOut} loading={signingOut}>
              Sign out of this device
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
