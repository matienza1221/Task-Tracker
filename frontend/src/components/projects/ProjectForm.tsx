import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../ui/Button';
import { DateField } from '../ui/DateField';
import { Input } from '../ui/Input';
import { useModalDirty } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { UserPicker } from '../ui/UserPicker';
import { Alert } from '../ui/Alert';
import { useVocabularies } from '../../features/meta/queries';
import { useCreateProject, useUpdateProject } from '../../features/projects/queries';
import { projectFormSchema, type ProjectFormValues } from '../../features/projects/schemas';
import type { Project } from '../../features/projects/types';
import type { UserLookupResult } from '../../features/users/types';
import { ApiError } from '../../lib/api/errors';
import { toast } from '../../stores/toastStore';

export interface ProjectFormProps {
  project?: Project;
  onSuccess: (project: Project) => void;
  onCancel: () => void;
}

export function ProjectForm({ project, onSuccess, onCancel }: ProjectFormProps) {
  const isEdit = Boolean(project);
  const vocab = useVocabularies();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject(project?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [manager, setManager] = useState<UserLookupResult | null>(
    project?.manager
      ? {
          id: project.manager.id,
          displayName: project.manager.displayName,
          email: project.manager.email,
          avatarUrl: project.manager.avatarUrl,
          globalRole: 'DEVELOPER',
        }
      : null,
  );

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      code: project?.code ?? '',
      name: project?.name ?? '',
      description: project?.description ?? '',
      statusId: project?.status.id ?? '',
      priorityId: project?.priority.id ?? '',
      startDate: project?.startDate ?? '',
      targetDate: project?.targetDate ?? '',
      managerId: project?.manager?.id ?? '',
    },
  });

  useModalDirty(isDirty);

  const statusOptions = (vocab.data?.projectStatuses ?? []).map((status) => ({
    value: status.id,
    label: status.name,
  }));
  const priorityOptions = (vocab.data?.taskPriorities ?? []).map((priority) => ({
    value: priority.id,
    label: priority.name,
  }));

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload: ProjectFormValues = {
      ...values,
      code: isEdit ? (project?.code ?? values.code) : values.code,
      description: values.description?.trim() ? values.description.trim() : '',
      managerId: manager?.id ?? '',
      statusId: values.statusId || undefined,
      priorityId: values.priorityId || undefined,
      startDate: values.startDate || undefined,
      targetDate: values.targetDate || undefined,
    };

    const mutation = isEdit ? updateProject : createProject;

    mutation.mutate(payload, {
      onSuccess: (result) => {
        toast.success(isEdit ? 'Project updated' : 'Project created', result.project.name);
        onSuccess(result.project);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.isValidationError) {
          for (const issue of error.details) {
            if (issue.path === 'code' || issue.path === 'name' || issue.path === 'targetDate' || issue.path === 'managerId') {
              setError(issue.path as keyof ProjectFormValues, { message: issue.message });
            }
          }
        }
        setFormError(error.message);
      },
    });
  });

  const pending = createProject.isPending || updateProject.isPending || isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Project code"
          placeholder="WEBAPP"
          disabled={isEdit}
          hint={isEdit ? 'Codes are immutable; task keys derive from them.' : '2–10 letters/digits, starts with a letter.'}
          error={errors.code?.message}
          {...register('code')}
        />
        <Input label="Project name" placeholder="Customer portal rewrite" error={errors.name?.message} {...register('name')} />
      </div>

      <Textarea
        label="Description"
        rows={3}
        placeholder="What is this project about?"
        error={errors.description?.message}
        {...register('description')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Status"
          placeholder="Use default (Planning)"
          options={statusOptions}
          error={errors.statusId?.message}
          {...register('statusId')}
        />
        <Select
          label="Priority"
          placeholder="Use default (Medium)"
          options={priorityOptions}
          error={errors.priorityId?.message}
          {...register('priorityId')}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField control={control} name="startDate" label="Start date" error={errors.startDate?.message} />
        <DateField control={control} name="targetDate" label="Target date" error={errors.targetDate?.message} />
      </div>

      <Controller
        control={control}
        name="managerId"
        render={() => (
          <UserPicker
            label="Project manager"
            value={manager}
            onChange={setManager}
            error={errors.managerId?.message}
            hint="Defaults to you when left empty."
          />
        )}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {isEdit ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  );
}
