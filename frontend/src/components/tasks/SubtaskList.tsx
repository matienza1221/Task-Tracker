import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ProgressBar } from '../ui/ProgressBar';
import { Select } from '../ui/Select';
import { useCreateSubtask, useUpdateTaskStatus } from '../../features/tasks/queries';
import { subtaskFormSchema, type SubtaskFormValues } from '../../features/tasks/schemas';
import type { Task } from '../../features/tasks/types';
import { useVocabularies } from '../../features/meta/queries';
import { TaskStatusBadge } from './TaskBadges';
import { toast } from '../../stores/toastStore';
import { cn } from '../../lib/cn';

/** Subtask list with quick status changes and inline creation. */
export function SubtaskList({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const vocab = useVocabularies();
  const createSubtask = useCreateSubtask(task.id, task.project.id);
  const updateStatus = useUpdateTaskStatus(task.id, task.project.id);
  const [adding, setAdding] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SubtaskFormValues>({ resolver: zodResolver(subtaskFormSchema), defaultValues: { title: '' } });

  const subtasks = task.subtasks ?? [];
  const statusOptions = (vocab.data?.taskStatuses ?? []).map((status) => ({ value: status.id, label: status.name }));

  const onSubmit = handleSubmit((values) => {
    createSubtask.mutate(
      { title: values.title },
      {
        onSuccess: () => {
          reset();
          setAdding(false);
          toast.success('Subtask created');
        },
        onError: (error) => toast.error('Could not create subtask', error.message),
      },
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {task.completedSubtaskCount} / {task.subtaskCount} subtasks completed
          </p>
          <ProgressBar value={task.progress} className="mt-1.5" label="Subtask progress" />
        </div>
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setAdding((value) => !value)}>
            {adding ? 'Cancel' : 'Add subtask'}
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Input label="Subtask title" placeholder="Setup Vite" error={errors.title?.message} {...register('title')} />
          </div>
          <Button type="submit" loading={createSubtask.isPending}>
            Add
          </Button>
        </form>
      )}

      {subtasks.length === 0 && !adding && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No subtasks yet.{canEdit ? ' Add one to track the steps of this task.' : ''}
        </p>
      )}

      {subtasks.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {subtasks.map((subtask) => (
            <li key={subtask.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Link
                to={`/tasks/${subtask.id}`}
                className="min-w-[160px] flex-1 text-sm text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
              >
                <span className="mr-2 font-mono text-[11px] text-slate-400">{subtask.displayKey}</span>
                <span className={cn(subtask.status.category === 'DONE' && 'text-slate-400 line-through')}>
                  {subtask.title}
                </span>
              </Link>
              {canEdit ? (
                <Select
                  label=""
                  aria-label={`Status for ${subtask.title}`}
                  className="w-40"
                  options={statusOptions}
                  value={subtask.status.id}
                  disabled={updateStatus.isPending}
                  onChange={(event) =>
                    updateStatus.mutate(
                      { statusId: event.target.value, version: subtask.version },
                      {
                        onSuccess: () => toast.success('Subtask updated', subtask.displayKey),
                        onError: (error) => toast.error('Could not update subtask', error.message),
                      },
                    )
                  }
                />
              ) : (
                <TaskStatusBadge status={subtask.status} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
