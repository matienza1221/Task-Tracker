import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { resetPasswordRequest } from '../features/auth/api';
import { PASSWORD_HINT, resetPasswordFormSchema, type ResetPasswordFormValues } from '../features/auth/schemas';
import { ApiError } from '../lib/api/errors';
import { toast } from '../stores/toastStore';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setFormError(null);
    try {
      await resetPasswordRequest({ token, newPassword: values.newPassword });
      setDone(true);
      toast.success('Password reset', 'Sign in with your new password.');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Reset link missing" description="This page needs a valid reset token.">
        <Alert variant="error">The reset link is missing its token. Request a new link from the sign-in page.</Alert>
        <Link
          to="/forgot-password"
          className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Request a new reset link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" description="Passwords must be at least 12 characters long.">
      {done ? (
        <div className="space-y-4">
          <Alert variant="success" title="Password updated">
            Your password has been changed and all previous sessions were signed out.
          </Alert>
          <Link
            to="/login"
            className="block text-center text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            hint={PASSWORD_HINT}
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Set new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
