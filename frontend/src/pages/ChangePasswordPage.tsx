import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useChangePassword, useMe } from '../features/auth/queries';
import { PASSWORD_HINT, changePasswordFormSchema, type ChangePasswordFormValues } from '../features/auth/schemas';
import { toast } from '../stores/toastStore';
import { ApiError } from '../lib/api/errors';

export function ChangePasswordPage() {
  const me = useMe();
  const changePassword = useChangePassword();
  const navigate = useNavigate();
  const forced = me.data?.mustChangePassword ?? false;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit((values) => {
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          reset();
          toast.success('Password changed', 'Other sessions have been signed out.');
          navigate('/dashboard', { replace: true });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.isValidationError && error.details.length > 0) {
            for (const issue of error.details) {
              if (issue.path === 'newPassword') setError('newPassword', { message: issue.message });
              if (issue.path === 'currentPassword') setError('currentPassword', { message: issue.message });
            }
            return;
          }
          setError('currentPassword', { message: error.message });
        },
      },
    );
  });

  return (
    <AuthLayout
      title={forced ? 'Set a new password' : 'Change your password'}
      description={
        forced
          ? 'Your account was created with a temporary password. Choose a new one to continue.'
          : 'Enter your current password, then choose a new one.'
      }
    >
      {forced && (
        <Alert variant="warning" className="mb-4">
          You must change your password before using the rest of the application.
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
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
        <Button type="submit" className="w-full" loading={changePassword.isPending || isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
