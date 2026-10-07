import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from '../../ui/Badge';
import { ProgressStat } from '../../ui/ProgressBar';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { DateField } from '../../ui/DateField';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import { Textarea } from '../../ui/Textarea';
import { Alert } from '../../ui/Alert';
import {
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useUpdateMilestone,
} from '../../../features/projects/queries';
import { milestoneFormSchema, type MilestoneFormValues } from '../../../features/projects/schemas';
import { projectRoleCan } from '../../../features/auth/roles';
import {
  MILESTONE_STATUS_BADGES,
  MILESTONE_STATUS_OPTIONS,
  type MilestoneStatus,
} from '../../../features/users/constants';
import type { Milestone, Project } from '../../../features/projects/types';
import { formatDate } from '../../../lib/format';
import { toast } from '../../../stores/toastStore';

function MilestoneForm({
  projectId,
  milestone,
  onDone,
}: {
  projectId: string;
  milestone?: Milestone;
  onDone: () => void;
}) {
  const create = useCreateMilestone(projectId);
  const update = useUpdateMilestone(projectId);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MilestoneFormValues>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: {
      name: milestone?.name ?? '',
      description: milestone?.description ?? '',
      targetDate: milestone?.targetDate ?? '',
      status: milestone?.status ?? 'PLANNED',
    },
  });

  useEffect(() => {
    reset({
      name: milestone?.name ?? '',
      description: milestone?.description ?? '',
      targetDate: milestone?.targetDate ?? '',
      status: milestone?.status ?? 'PLANNED',
    });
  }, [milestone, reset]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload = {
      ...values,
      description: values.description?.trim() ? values.description.trim() : undefined,
      targetDate: values.targetDate || undefined,
    };
    if (milestone) {
      update.mutate(
        { milestoneId: milestone.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Milestone updated');
            onDone();
          },
          onError: (error) => setFormError(error.message),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('Milestone created');
          onDone();
        },
        onError: (error) => setFormError(error.message),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      <Input label="Milestone name" placeholder="MVP Release" error={errors.name?.message} {...register('name')} />
      <Textarea label="Description" rows={2} error={errors.description?.message} {...register('description')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField control={control} name="targetDate" label="Target date" error={errors.targetDate?.message} />
        <Select label="Status" options={MILESTONE_STATUS_OPTIONS} error={errors.status?.message} {...register('status')} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {milestone ? 'Save milestone' : 'Create milestone'}
        </Button>
      </div>
    </form>
  );
}

export function MilestonesTab({ project }: { project: Project }) {
  const milestones = useMilestones(project.id);
  const updateMilestone = useUpdateMilestone(project.id);
  const deleteMilestone = useDeleteMilestone(project.id);
  const canManage = projectRoleCan(project.myRole, 'project:manage_milestones');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Milestone | null>(null);

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (milestone: Milestone) => {
    setEditing(milestone);
    setFormOpen(true);
  };

  const changeStatus = (milestone: Milestone, status: MilestoneStatus) => {
    updateMilestone.mutate(
      { milestoneId: milestone.id, data: { status } },
      {
        onSuccess: () => toast.success('Milestone updated', `${milestone.name} is now ${status.toLowerCase().replace('_', ' ')}.`),
        onError: (error) => toast.error('Could not update milestone', error.message),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Milestones</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Group delivery checkpoints and attach tasks to track progress.
          </p>
        </div>
        {canManage && <Button onClick={openCreate}>New milestone</Button>}
      </div>

      {milestones.isLoading && (
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardBody>
        </Card>
      )}

      {milestones.isError && (
        <ErrorState title="Could not load milestones" description={milestones.error.message} onRetry={() => milestones.refetch()} />
      )}

      {!milestones.isLoading && !milestones.isError && (milestones.data?.milestones.length ?? 0) === 0 && (
        <EmptyState
          title="No milestones yet"
          description={canManage ? 'Create a milestone such as “MVP Release” with a target date.' : 'Milestones will appear here once a manager creates them.'}
          action={canManage ? <Button onClick={openCreate}>New milestone</Button> : undefined}
        />
      )}

      <div className="space-y-3">
        {(milestones.data?.milestones ?? []).map((milestone) => (
          <Card key={milestone.id}>
            <CardHeader
              title={milestone.name}
              description={milestone.targetDate ? `Target ${formatDate(milestone.targetDate)}` : 'No target date'}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={MILESTONE_STATUS_BADGES[milestone.status]}>
                    {MILESTONE_STATUS_OPTIONS.find((option) => option.value === milestone.status)?.label}
                  </Badge>
                  {canManage && (
                    <>
                      <Select
                        label=""
                        aria-label={`Status for ${milestone.name}`}
                        className="w-36"
                        options={MILESTONE_STATUS_OPTIONS}
                        value={milestone.status}
                        disabled={updateMilestone.isPending}
                        onChange={(event) => changeStatus(milestone, event.target.value as MilestoneStatus)}
                      />
                      <Button variant="secondary" size="sm" onClick={() => openEdit(milestone)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPendingDelete(milestone)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              }
            />
            <CardBody className="space-y-2">
              {milestone.description && (
                <p className="text-sm text-slate-600 dark:text-slate-300">{milestone.description}</p>
              )}
              <ProgressStat value={milestone.progress} />
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {milestone.completedTaskCount}/{milestone.taskCount} linked task{milestone.taskCount === 1 ? '' : 's'} done
                </span>
                {milestone.overdueTaskCount > 0 && (
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {milestone.overdueTaskCount} overdue
                  </span>
                )}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit milestone' : 'New milestone'}
        size="md"
      >
        <MilestoneForm projectId={project.id} milestone={editing} onDone={() => setFormOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete milestone"
        description={pendingDelete ? `Delete “${pendingDelete.name}”? This can be undone only by a database administrator.` : ''}
        confirmLabel="Delete"
        loading={deleteMilestone.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMilestone.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Milestone deleted');
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Could not delete milestone', error.message);
              setPendingDelete(null);
            },
          });
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
