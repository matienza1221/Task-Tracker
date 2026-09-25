import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useLogin, useMe } from '../features/auth/queries';
import { loginFormSchema, type LoginFormValues } from '../features/auth/schemas';
import { toast } from '../stores/toastStore';

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema), defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (me.data) {
      navigate(me.data.mustChangePassword ? '/change-password' : from, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    login.mutate(values, {
      onSuccess: (payload) => {
        toast.success(`Welcome back, ${payload.user.displayName}`);
        navigate(payload.user.mustChangePassword ? '/change-password' : from, { replace: true });
      },
      onError: (error) => {
        setFormError(error.message);
      },
    });
  });

  return (
    <AuthLayout title="Sign in" description="Use the account your administrator created for you.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" className="w-full" loading={login.isPending || isSubmitting}>
          Sign in
        </Button>

        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
