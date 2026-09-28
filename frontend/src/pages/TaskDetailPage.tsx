import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { Alert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DatePicker } from '../components/ui/DatePicker';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Select } from '../components/ui/Select';
import { ErrorState, Skeleton } from '../components/ui/States';
import { Textarea } from '../components/ui/Textarea';
import { TaskForm } from '../components/tasks/TaskForm';
import { LabelChips, LabelPicker } from '../components/tasks/LabelPicker';
import { SubtaskList } from '../components/tasks/SubtaskList';
import { CommentsSection } from '../components/tasks/CommentsSection';
import { DependenciesSection } from '../components/tasks/DependenciesSection';
import { AttachmentsSection } from '../components/tasks/AttachmentsSection';
import { TaskPriorityBadge, TaskStatusBadge, TaskTypeBadge } from '../components/tasks/TaskBadges';
import { ArrowRightIcon, CalendarIcon, CodeIcon, UsersIcon } from '../components/ui/icons';
import { projectRoleCan } from '../features/auth/roles';
import { useVocabularies } from '../features/meta/queries';
import { useLabels, useMembers, useMilestones, useProject } from '../features/projects/queries';
import { useDeleteTask, useTask, useTaskActivity, useUpdateTask, useUpdateTaskAssignee, useUpdateTaskStatus } from '../features/tasks/queries';
import type { Task, TaskFormInput } from '../features/tasks/types';
import { ApiError } from '../lib/api/errors';
import { formatDate, formatDateTime, formatRelative } from '../lib/format';
import { toast } from '../stores/toastStore';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-36 shrink-0 pt-1 text-xs leading-tight font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-right text-sm text-slate-800 dark:text-slate-100">{children}</div>
    </div>
  );
}

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const taskQuery = useTask(taskId);
  const task = taskQuery.data?.task;
  const projectId = task?.project.id ?? '';

  const projectQuery = useProject(projectId || undefined);
  const myRole = projectQuery.data?.project.myRole ?? null;
  const canUpdate = projectRoleCan(myRole, 'task:update');
  const canUpdateStatus = projectRoleCan(myRole, 'task:update_status');
  const canDelete = projectRoleCan(myRole, 'task:delete');
  const canCreate = projectRoleCan(myRole, 'task:create');
  const canAssign = projectRoleCan(myRole, 'task:assign');
  const canComment = projectRoleCan(myRole, 'comment:create');
  const canModerateComments = projectRoleCan(myRole, 'comment:moderate');
  const canUpload = projectRoleCan(myRole, 'attachment:upload');
  const canModerateAttachments = projectRoleCan(myRole, 'attachment:moderate');
  const canManageDependencies = projectRoleCan(myRole, 'task:manage_dependencies');

  const vocab = useVocabularies();
  const members = useMembers(projectId, Boolean(projectId));
  const milestones = useMilestones(projectId, Boolean(projectId));
  const labels = useLabels(projectId, Boolean(projectId));

  const updateTask = useUpdateTask(taskId ?? '', projectId || undefined);
  const updateStatus = useUpdateTaskStatus(taskId ?? '', projectId || undefined);
  const updateAssignee = useUpdateTaskAssignee(taskId ?? '', projectId || undefined);
  const deleteTask = useDeleteTask(projectId || undefined);
  const [activityPage, setActivityPage] = useState(1);
  const activity = useTaskActivity(taskId ?? '', activityPage);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState({ nextStep: '', verificationNote: '' });
  const [progressDraft, setProgressDraft] = useState<number | null>(null);

  useEffect(() => {
    if (!task) return;
    setDescriptionDraft(task.description ?? '');
    setNotesDraft({ nextStep: task.nextStep ?? '', verificationNote: task.verificationNote ?? '' });
    setProgressDraft(task.progress);
    setActivityPage(1);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConflict = (error: Error) => {
    if (error instanceof ApiError && error.status === 409) {
      toast.error('Task changed elsewhere', 'Reloading the latest version.');
      taskQuery.refetch();
      return true;
    }
    return false;
  };

  const save = (input: Partial<TaskFormInput>, successMessage?: string) => {
    if (!task) return;
    updateTask.mutate(
      { ...input, version: task.version },
      {
        onSuccess: () => successMessage && toast.success(successMessage),
        onError: (error) => {
          if (!handleConflict(error)) toast.error('Could not save', error.message);
          else setDescriptionDraft(task.description ?? '');
        },
      },
    );
  };

  if (taskQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (taskQuery.isError || !task) {
    const notFound = taskQuery.error instanceof ApiError && taskQuery.error.isNotFound;
    return (
      <div className="space-y-4">
        <ErrorState
          title={notFound ? 'Task not found' : 'Could not load task'}
          description={
            notFound ? 'This task does not exist or you do not have access to it.' : taskQuery.error?.message
          }
          onRetry={notFound ? undefined : () => taskQuery.refetch()}
        />
        <Link
          to="/my-tasks"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Back to my tasks <ArrowRightIcon className="text-sm" />
        </Link>
      </div>
    );
  }

  const statusOptions = (vocab.data?.taskStatuses ?? []).map((item) => ({ value: item.id, label: item.name }));
  const priorityOptions = (vocab.data?.taskPriorities ?? []).map((item) => ({ value: item.id, label: item.name }));
  const typeOptions = (vocab.data?.taskTypes ?? []).map((item) => ({ value: item.id, label: item.name }));
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...(members.data?.members ?? []).map((member) => ({ value: member.userId, label: member.displayName })),
  ];
  const milestoneOptions = [
    { value: '', label: 'No milestone' },
    ...(milestones.data?.milestones ?? []).map((milestone) => ({ value: milestone.id, label: milestone.name })),
  ];
  const labelItems = (labels.data?.labels ?? []).map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
  }));

  const descriptionDirty = descriptionDraft.trim() !== (task.description ?? '');
  const notesDirty =
    notesDraft.nextStep.trim() !== (task.nextStep ?? '') ||
    notesDraft.verificationNote.trim() !== (task.verificationNote ?? '');

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500 dark:text-slate-400">
        <Link to="/projects" className="hover:text-indigo-600 dark:hover:text-indigo-400">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <Link to={`/projects/${task.project.id}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
          {task.project.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono text-slate-700 dark:text-slate-200">{task.displayKey}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {task.displayKey}
            </span>
            <TaskTypeBadge type={task.type} />
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            {task.isOverdue && <span className="text-xs font-medium text-red-600 dark:text-red-400">Overdue</span>}
            {task.parent && (
              <Link to={`/tasks/${task.parent.id}`} className="text-xs text-slate-500 hover:text-indigo-600">
                Subtask of {task.parent.key}
              </Link>
            )}
          </div>
          <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{task.title}</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Reported by {task.reporter?.displayName ?? 'unknown'} · created {formatRelative(task.createdAt)} · updated{' '}
            {formatRelative(task.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpdate && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit task
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Description"
              actions={
                canUpdate && descriptionDirty ? (
                  <Button
                    size="sm"
                    loading={updateTask.isPending}
                    onClick={() => save({ description: descriptionDraft }, 'Description saved')}
                  >
                    Save
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {canUpdate ? (
                <Textarea
                  label=""
                  aria-label="Task description"
                  rows={5}
                  value={descriptionDraft}
                  placeholder="What needs to happen?"
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                />
              ) : (
                <p className="text-sm whitespace-pre-line text-slate-600 dark:text-slate-300">
                  {task.description || 'No description.'}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Subtasks"
              description={task.progressMode === 'AUTO' ? 'Parent progress is calculated from these' : undefined}
            />
            <CardBody>
              <SubtaskList task={task} canEdit={canCreate} />
            </CardBody>
          </Card>

          {task.codeReferences.length > 0 && (
            <Card>
              <CardHeader title="Code references" description="Where this work touches the codebase." />
              <CardBody>
                <ul className="flex flex-wrap gap-2">
                  {task.codeReferences.map((reference) => (
                    <li
                      key={reference}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <CodeIcon className="text-xs text-slate-400" />
                      {reference}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <DependenciesSection task={task} projectId={task.project.id} canManage={canManageDependencies} />

          <CommentsSection
            taskId={task.id}
            projectId={task.project.id}
            canComment={canComment}
            canModerate={canModerateComments}
          />

          <AttachmentsSection taskId={task.id} canUpload={canUpload} canModerate={canModerateAttachments} />

          <ActivityFeed
            entries={activity.data?.data.activity ?? []}
            isLoading={activity.isLoading}
            isError={activity.isError}
            errorMessage={activity.error?.message}
            onRetry={() => activity.refetch()}
            title="Activity"
            description="History for this task"
            page={activityPage}
            totalPages={Number(activity.data?.meta.totalPages ?? 1)}
            onPageChange={setActivityPage}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="divide-y divide-slate-100 dark:divide-slate-800">
              <DetailRow label="Status">
                {canUpdateStatus ? (
                  <Select
                    label=""
                    aria-label="Task status"
                    options={statusOptions}
                    value={task.status.id}
                    disabled={updateStatus.isPending}
                    onChange={(event) =>
                      updateStatus.mutate(
                        { statusId: event.target.value, version: task.version },
                        {
                          onSuccess: (result) => toast.success('Status updated', result.task.status.name),
                          onError: (error) => {
                            if (!handleConflict(error)) toast.error('Could not update status', error.message);
                          },
                        },
                      )
                    }
                  />
                ) : (
                  <TaskStatusBadge status={task.status} />
                )}
              </DetailRow>

              <DetailRow label="Priority">
                {canUpdate ? (
                  <Select
                    label=""
                    aria-label="Task priority"
                    options={priorityOptions}
                    value={task.priority.id}
                    onChange={(event) => save({ priorityId: event.target.value }, 'Priority updated')}
                  />
                ) : (
                  <TaskPriorityBadge priority={task.priority} />
                )}
              </DetailRow>

              <DetailRow label="Type">
                {canUpdate ? (
                  <Select
                    label=""
                    aria-label="Task type"
                    options={typeOptions}
                    value={task.type.id}
                    onChange={(event) => save({ typeId: event.target.value }, 'Type updated')}
                  />
                ) : (
                  <TaskTypeBadge type={task.type} />
                )}
              </DetailRow>

              <DetailRow label="Assignee">
                {canUpdate || canAssign ? (
                  <Select
                    label=""
                    aria-label="Task assignee"
                    options={assigneeOptions}
                    value={task.assignee?.id ?? ''}
                    disabled={updateAssignee.isPending}
                    onChange={(event) =>
                      updateAssignee.mutate(
                        { assigneeId: event.target.value || null, version: task.version },
                        {
                          onSuccess: () => toast.success('Assignee updated'),
                          onError: (error) => {
                            if (!handleConflict(error)) toast.error('Could not reassign', error.message);
                          },
                        },
                      )
                    }
                  />
                ) : task.assignee ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={task.assignee.displayName} src={task.assignee.avatarUrl} size="sm" />
                    {task.assignee.displayName}
                  </span>
                ) : (
                  <span className="italic text-slate-400">Unassigned</span>
                )}
              </DetailRow>

              <DetailRow label="Start date">
                {canUpdate ? (
                  <DatePicker
                    label=""
                    aria-label="Start date"
                    value={task.startDate ?? ''}
                    onChange={(value) => save({ startDate: value || undefined }, 'Start date updated')}
                  />
                ) : (
                  formatDate(task.startDate)
                )}
              </DetailRow>

              <DetailRow label="Due date">
                {canUpdate ? (
                  <DatePicker
                    label=""
                    aria-label="Due date"
                    value={task.dueDate ?? ''}
                    onChange={(value) => save({ dueDate: value || undefined }, 'Due date updated')}
                  />
                ) : (
                  <span className={task.isOverdue ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
                    {formatDate(task.dueDate)}
                  </span>
                )}
              </DetailRow>

              <DetailRow label="Milestone">
                {canUpdate ? (
                  <Select
                    label=""
                    aria-label="Milestone"
                    options={milestoneOptions}
                    value={task.milestone?.id ?? ''}
                    onChange={(event) => save({ milestoneId: event.target.value || null }, 'Milestone updated')}
                  />
                ) : (
                  (task.milestone?.name ?? '—')
                )}
              </DetailRow>

              <DetailRow label="Estimated / actual">
                {canUpdate ? (
                  <span className="flex items-center justify-end gap-2">
                    <Input
                      label=""
                      aria-label="Estimated hours"
                      type="number"
                      step="0.5"
                      min="0"
                      className="w-24"
                      defaultValue={task.estimatedHours ?? ''}
                      onBlur={(event) =>
                        save(
                          { estimatedHours: event.target.value === '' ? null : Number(event.target.value) },
                          'Estimate updated',
                        )
                      }
                    />
                    <Input
                      label=""
                      aria-label="Actual hours"
                      type="number"
                      step="0.5"
                      min="0"
                      className="w-24"
                      defaultValue={task.actualHours}
                      onBlur={(event) =>
                        save({ actualHours: event.target.value === '' ? 0 : Number(event.target.value) }, 'Hours updated')
                      }
                    />
                  </span>
                ) : (
                  `${task.estimatedHours ?? '—'} h / ${task.actualHours} h`
                )}
              </DetailRow>

              <DetailRow label="Progress">
                <div className="space-y-1.5">
                  {canUpdate && task.progressMode === 'MANUAL' ? (
                    <Input
                      label=""
                      aria-label="Progress percent"
                      type="number"
                      min="0"
                      max="100"
                      value={progressDraft ?? task.progress}
                      disabled={updateTask.isPending}
                      onChange={(event) => setProgressDraft(Number(event.target.value))}
                      onBlur={() => {
                        const next = Math.max(0, Math.min(100, progressDraft ?? task.progress));
                        if (next !== task.progress) save({ progress: next }, 'Progress updated');
                      }}
                    />
                  ) : (
                    <>
                      <ProgressBar value={task.progress} label="Task progress" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {task.progressMode === 'AUTO' ? 'Calculated from subtasks' : `${Math.round(task.progress)}%`}
                      </p>
                    </>
                  )}
                </div>
              </DetailRow>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Labels" />
            <CardBody>
              {canUpdate ? (
                <LabelPicker
                  labels={labelItems}
                  selected={task.labels.map((label) => label.id)}
                  disabled={updateTask.isPending}
                  onChange={(ids) => save({ labelIds: ids }, 'Labels updated')}
                />
              ) : task.labels.length > 0 ? (
                <LabelChips labels={task.labels} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No labels.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Notes"
              actions={
                canUpdate && notesDirty ? (
                  <Button
                    size="sm"
                    loading={updateTask.isPending}
                    onClick={() =>
                      save(
                        {
                          nextStep: notesDraft.nextStep.trim() || undefined,
                          verificationNote: notesDraft.verificationNote.trim() || undefined,
                        },
                        'Notes saved',
                      )
                    }
                  >
                    Save
                  </Button>
                ) : undefined
              }
            />
            <CardBody className="space-y-3">
              <Textarea
                label="Next step / blocker"
                rows={2}
                value={notesDraft.nextStep}
                disabled={!canUpdate}
                onChange={(event) => setNotesDraft((draft) => ({ ...draft, nextStep: event.target.value }))}
              />
              <Textarea
                label="Verification note"
                rows={2}
                value={notesDraft.verificationNote}
                disabled={!canUpdate}
                onChange={(event) => setNotesDraft((draft) => ({ ...draft, verificationNote: event.target.value }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timestamps" />
            <CardBody className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <p className="inline-flex items-center gap-1.5">
                <CalendarIcon className="text-sm" /> Created {formatDateTime(task.createdAt)}
              </p>
              <p className="inline-flex items-center gap-1.5">
                <CalendarIcon className="text-sm" /> Updated {formatDateTime(task.updatedAt)}
              </p>
              {task.completedAt && (
                <p className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CalendarIcon className="text-sm" /> Completed {formatDateTime(task.completedAt)}
                </p>
              )}
              <p className="inline-flex items-center gap-1.5">
                <UsersIcon className="text-sm" /> Version {task.version}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${task.displayKey}`} size="lg">
        <TaskForm
          projectId={task.project.id}
          task={task}
          onSuccess={() => setEditOpen(false)}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete task"
        description={`Delete ${task.displayKey} — “${task.title}”? Its subtasks are removed too. This cannot be undone from the UI.`}
        confirmLabel="Delete task"
        loading={deleteTask.isPending}
        onConfirm={() =>
          deleteTask.mutate(task.id, {
            onSuccess: () => {
              toast.success('Task deleted');
              navigate(`/projects/${task.project.id}?tab=tasks`);
            },
            onError: (error) => {
              toast.error('Could not delete task', error.message);
              setDeleteOpen(false);
            },
          })
        }
        onClose={() => setDeleteOpen(false)}
      />

      {task.progressMode === 'AUTO' && (
        <Alert variant="info">Progress for this task is calculated automatically from its subtasks.</Alert>
      )}
    </div>
  );
}

export type { Task };
