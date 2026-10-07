import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ArrowRightIcon } from '../components/ui/icons';
import { requestPasswordReset } from '../features/auth/api';
import { forgotPasswordFormSchema, type ForgotPasswordFormValues } from '../features/auth/schemas';
import { ApiError } from '../lib/api/errors';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we will send a reset link if an account exists."
    >
      {sent ? (
        <div className="space-y-4">
          <Alert variant="success" title="Check your inbox">
            If an account exists for that address, we have sent a password reset link. Remember to check your spam
            folder.
          </Alert>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Back to sign in <ArrowRightIcon className="text-sm" />
          </Link>
        </div>
      ) : (
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
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
          <Link
            to="/login"
            className="block text-center text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
