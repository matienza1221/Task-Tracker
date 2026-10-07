import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { createUserFormSchema, type CreateUserFormValues } from '../../features/users/schemas';
import { useCreateUser } from '../../features/users/queries';
import { GLOBAL_ROLE_OPTIONS } from '../../features/users/constants';
import { toast } from '../../stores/toastStore';

export interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (temporaryPassword: string | null, displayName: string) => void;
}

export function UserFormModal({ open, onClose, onCreated }: UserFormModalProps) {
  const createUser = useCreateUser();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: { email: '', displayName: '', globalRole: 'DEVELOPER', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    createUser.mutate(
      {
        email: values.email,
        displayName: values.displayName,
        globalRole: values.globalRole,
        password: values.password?.trim() ? values.password : undefined,
      },
      {
        onSuccess: (result) => {
          toast.success('User created', `${result.user.displayName} must change the password at first sign-in.`);
          reset();
          onCreated(result.temporaryPassword, result.user.displayName);
          onClose();
        },
        onError: (error) => setFormError(error.message),
      },
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New user"
      description="Users receive a temporary password and must change it at first sign-in."
      size="md"
      dirty={isDirty}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <Input
          label="Email"
          type="email"
          autoComplete="off"
          placeholder="person@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Display name"
          placeholder="Jane Developer"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <Select
          label="Global role"
          options={GLOBAL_ROLE_OPTIONS}
          error={errors.globalRole?.message}
          {...register('globalRole')}
        />
        <Input
          label="Password (optional)"
          type="password"
          autoComplete="new-password"
          hint="Leave empty to generate a strong temporary password."
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={createUser.isPending}>
            Create user
          </Button>
        </div>
      </form>
    </Modal>
  );
}
