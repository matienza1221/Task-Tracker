import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import { Alert } from '../../ui/Alert';
import { useCreateLabel, useDeleteLabel, useLabels, useUpdateLabel } from '../../../features/projects/queries';
import { labelFormSchema, type LabelFormValues } from '../../../features/projects/schemas';
import { projectRoleCan } from '../../../features/auth/roles';
import type { Project, ProjectLabel } from '../../../features/projects/types';
import { toast } from '../../../stores/toastStore';

function LabelForm({ projectId, label, onDone }: { projectId: string; label?: ProjectLabel; onDone: () => void }) {
  const create = useCreateLabel(projectId);
  const update = useUpdateLabel(projectId);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LabelFormValues>({
    resolver: zodResolver(labelFormSchema),
    defaultValues: { name: label?.name ?? '', color: label?.color ?? '#6366f1' },
  });

  useEffect(() => {
    reset({ name: label?.name ?? '', color: label?.color ?? '#6366f1' });
  }, [label, reset]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    if (label) {
      update.mutate(
        { labelId: label.id, data: values },
        {
          onSuccess: () => {
            toast.success('Label updated');
            onDone();
          },
          onError: (error) => setFormError(error.message),
        },
      );
    } else {
      create.mutate(values, {
        onSuccess: () => {
          toast.success('Label created');
          onDone();
        },
        onError: (error) => setFormError(error.message),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Input label="Label name" placeholder="Frontend" error={errors.name?.message} {...register('name')} />
        <Input label="Colour" type="color" className="h-10 p-1" error={errors.color?.message} {...register('color')} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {label ? 'Save label' : 'Create label'}
        </Button>
      </div>
    </form>
  );
}

export function LabelsTab({ project }: { project: Project }) {
  const labels = useLabels(project.id);
  const deleteLabel = useDeleteLabel(project.id);
  const canManage = projectRoleCan(project.myRole, 'project:manage_labels');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectLabel | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<ProjectLabel | null>(null);

  const projectLabels = (labels.data?.labels ?? []).filter((label) => !label.isGlobal);
  const globalLabels = (labels.data?.labels ?? []).filter((label) => label.isGlobal);

  const openCreate = () => {
    setEditing(undefined);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Labels</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Labels categorise tasks. Global labels are managed by administrators and available everywhere.
          </p>
        </div>
        {canManage && <Button onClick={openCreate}>New label</Button>}
      </div>

      {labels.isLoading && (
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-8 w-2/3" />
          </CardBody>
        </Card>
      )}

      {labels.isError && (
        <ErrorState title="Could not load labels" description={labels.error.message} onRetry={() => labels.refetch()} />
      )}

      {!labels.isLoading && !labels.isError && projectLabels.length === 0 && (
        <EmptyState
          title="No project labels yet"
          description={canManage ? 'Add labels such as Frontend, Backend or Deployment.' : 'Labels created by managers will appear here.'}
          action={canManage ? <Button onClick={openCreate}>New label</Button> : undefined}
        />
      )}

      {projectLabels.length > 0 && (
        <Card>
          <CardHeader title="Project labels" description={`${projectLabels.length} label${projectLabels.length === 1 ? '' : 's'}`} />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {projectLabels.map((label) => (
              <li key={label.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="inline-flex items-center gap-2.5 text-sm text-slate-900 dark:text-slate-100">
                  <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
                  {label.name}
                  <span className="font-mono text-xs text-slate-400">{label.color}</span>
                </span>
                {canManage && (
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(label);
                        setEditorOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(label)}>
                      Delete
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {globalLabels.length > 0 && (
        <Card>
          <CardHeader title="Global labels" description="Available to every project; administrator-managed." />
          <ul className="flex flex-wrap gap-2 px-5 py-4">
            {globalLabels.map((label) => (
              <li
                key={label.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                {label.name}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'Edit label' : 'New label'} size="sm">
        <LabelForm projectId={project.id} label={editing} onDone={() => setEditorOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete label"
        description={pendingDelete ? `Delete the label “${pendingDelete.name}”? Tasks using it will lose this tag.` : ''}
        confirmLabel="Delete"
        loading={deleteLabel.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteLabel.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Label deleted');
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Could not delete label', error.message);
              setPendingDelete(null);
            },
          });
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
