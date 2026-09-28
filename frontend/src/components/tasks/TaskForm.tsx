import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { DateField } from '../ui/DateField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { useVocabularies } from '../../features/meta/queries';
import { useLabels, useMembers, useMilestones } from '../../features/projects/queries';
import { useCreateTask, useUpdateTask } from '../../features/tasks/queries';
import { parseCodeReferences, taskFormSchema, type TaskFormValues } from '../../features/tasks/schemas';
import type { Task, TaskFormInput } from '../../features/tasks/types';
import { asApiError } from '../../lib/api/errors';
import { toast } from '../../stores/toastStore';
import { LabelPicker } from './LabelPicker';

export interface TaskFormProps {
  projectId: string;
  task?: Task;
  defaultStatusId?: string;
  defaultMilestoneId?: string;
  onSuccess: (task: Task) => void;
  onCancel: () => void;
}

export function TaskForm({ projectId, task, defaultStatusId, defaultMilestoneId, onSuccess, onCancel }: TaskFormProps) {
  const isEdit = Boolean(task);
  const vocab = useVocabularies();
  const labels = useLabels(projectId);
  const milestones = useMilestones(projectId);
  const members = useMembers(projectId);
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(task?.id ?? '', projectId);
  const [formError, setFormError] = useState<string | null>(null);

  const canSetProgress = !task || task.subtaskCount === 0;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      statusId: task?.status.id ?? defaultStatusId ?? '',
      priorityId: task?.priority.id ?? '',
      typeId: task?.type.id ?? '',
      assigneeId: task?.assignee?.id ?? '',
      milestoneId: task?.milestone?.id ?? defaultMilestoneId ?? '',
      startDate: task?.startDate ?? '',
      dueDate: task?.dueDate ?? '',
      estimatedHours: task?.estimatedHours ?? undefined,
      actualHours: task?.actualHours ?? undefined,
      progress: task?.progress ?? undefined,
      nextStep: task?.nextStep ?? '',
      verificationNote: task?.verificationNote ?? '',
      codeReferencesText: task?.codeReferences.join('\n') ?? '',
      labelIds: task?.labels.map((label) => label.id) ?? [],
    },
  });

  const selectedLabels = watch('labelIds') ?? [];

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload: TaskFormInput = {
      title: values.title,
      description: values.description?.trim() ? values.description.trim() : undefined,
      statusId: values.statusId || undefined,
      priorityId: values.priorityId || undefined,
      typeId: values.typeId || undefined,
      assigneeId: values.assigneeId || null,
      milestoneId: values.milestoneId || null,
      startDate: values.startDate || undefined,
      dueDate: values.dueDate || undefined,
      estimatedHours: values.estimatedHours ?? null,
      actualHours: values.actualHours ?? undefined,
      progress: canSetProgress ? values.progress : undefined,
      nextStep: values.nextStep?.trim() ? values.nextStep.trim() : undefined,
      verificationNote: values.verificationNote?.trim() ? values.verificationNote.trim() : undefined,
      codeReferences: parseCodeReferences(values.codeReferencesText),
      labelIds: values.labelIds ?? [],
    };

    const onError = (error: Error) => {
      const apiError = asApiError(error);
      if (apiError.isValidationError) {
        for (const issue of apiError.details) {
          const field = issue.path as keyof TaskFormValues;
          if (field in values) setError(field, { message: issue.message });
        }
      }
      setFormError(apiError.message);
    };

    if (isEdit && task) {
      updateTask.mutate(
        { ...payload, version: task.version },
        {
          onSuccess: (result) => {
            toast.success('Task updated', result.task.displayKey);
            onSuccess(result.task);
          },
          onError,
        },
      );
    } else {
      createTask.mutate(payload, {
        onSuccess: (result) => {
          toast.success('Task created', result.task.key);
          onSuccess(result.task);
        },
        onError,
      });
    }
  });

  const pending = createTask.isPending || updateTask.isPending || isSubmitting;
  const statusOptions = (vocab.data?.taskStatuses ?? []).map((item) => ({ value: item.id, label: item.name }));
  const priorityOptions = (vocab.data?.taskPriorities ?? []).map((item) => ({ value: item.id, label: item.name }));
  const typeOptions = (vocab.data?.taskTypes ?? []).map((item) => ({ value: item.id, label: item.name }));
  const assigneeOptions = (members.data?.members ?? []).map((member) => ({
    value: member.userId,
    label: member.displayName,
  }));
  const milestoneOptions = (milestones.data?.milestones ?? []).map((milestone) => ({
    value: milestone.id,
    label: milestone.name,
  }));
  const labelOptions = (labels.data?.labels ?? []).map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
  }));

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Input
        label="Title"
        placeholder="Convert monitoring portal to React"
        error={errors.title?.message}
        {...register('title')}
      />

      <Textarea
        label="Description"
        rows={3}
        placeholder="What needs to happen?"
        error={errors.description?.message}
        {...register('description')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Status" placeholder="Use default" options={statusOptions} error={errors.statusId?.message} {...register('statusId')} />
        <Select label="Priority" placeholder="Use default" options={priorityOptions} error={errors.priorityId?.message} {...register('priorityId')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Type" placeholder="Use default" options={typeOptions} error={errors.typeId?.message} {...register('typeId')} />
        <Select
          label="Assignee"
          placeholder="Unassigned"
          options={assigneeOptions}
          error={errors.assigneeId?.message}
          {...register('assigneeId')}
        />
        <Select
          label="Milestone"
          placeholder="None"
          options={milestoneOptions}
          error={errors.milestoneId?.message}
          {...register('milestoneId')}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField control={control} name="startDate" label="Start date" error={errors.startDate?.message} />
        <DateField control={control} name="dueDate" label="Due date" error={errors.dueDate?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Estimated hours"
          type="number"
          step="0.5"
          min="0"
          error={errors.estimatedHours?.message}
          {...register('estimatedHours')}
        />
        <Input
          label="Actual hours"
          type="number"
          step="0.5"
          min="0"
          error={errors.actualHours?.message}
          {...register('actualHours')}
        />
        {canSetProgress ? (
          <Input
            label="Progress %"
            type="number"
            min="0"
            max="100"
            hint={task?.progressMode === 'AUTO' ? 'Derived from subtasks' : undefined}
            error={errors.progress?.message}
            {...register('progress')}
          />
        ) : (
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Progress</span>
            <p className="pt-2 text-xs text-slate-500 dark:text-slate-400">
              Calculated from {task?.subtaskCount} subtask{task?.subtaskCount === 1 ? '' : 's'}.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea label="Next step / blocker" rows={2} error={errors.nextStep?.message} {...register('nextStep')} />
        <Textarea
          label="Verification note"
          rows={2}
          placeholder="Verified in staging"
          error={errors.verificationNote?.message}
          {...register('verificationNote')}
        />
      </div>

      <Textarea
        label="Code references"
        rows={2}
        placeholder={'src/components/Table.tsx:120-160\nsrc/api/client.ts'}
        hint="One reference per line, e.g. file:line."
        error={errors.codeReferencesText?.message}
        {...register('codeReferencesText')}
      />

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Labels</span>
        <Controller
          control={control}
          name="labelIds"
          render={() => (
            <LabelPicker
              labels={labelOptions}
              selected={selectedLabels}
              disabled={pending}
              onChange={(ids) => setValue('labelIds', ids, { shouldDirty: true })}
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {isEdit ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </form>
  );
}
