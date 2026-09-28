import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../ui/Alert';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { ProgressBar } from '../../ui/ProgressBar';
import { Select } from '../../ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import { UserPicker } from '../../ui/UserPicker';
import { ChevronDownIcon, ChevronRightIcon } from '../../ui/icons';
import { TaskPriorityBadge, TaskStatusBadge } from '../../tasks/TaskBadges';
import {
  useAddMember,
  useMemberProgress,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from '../../../features/projects/queries';
import { projectRoleCan } from '../../../features/auth/roles';
import { useMe } from '../../../features/auth/queries';
import { PROJECT_ROLE_LABELS, PROJECT_ROLE_OPTIONS, type ProjectRole } from '../../../features/users/constants';
import type { UserLookupResult } from '../../../features/users/types';
import type { Project, ProjectMember } from '../../../features/projects/types';
import { GLOBAL_ROLE_LABELS } from '../../../features/users/constants';
import { cn } from '../../../lib/cn';
import { formatDate } from '../../../lib/format';
import { toast } from '../../../stores/toastStore';

export function MembersTab({ project }: { project: Project }) {
  const me = useMe();
  const members = useMembers(project.id);
  const progress = useMemberProgress(project.id);
  const addMember = useAddMember(project.id);
  const updateRole = useUpdateMemberRole(project.id);
  const removeMember = useRemoveMember(project.id);

  const canManage = projectRoleCan(project.myRole, 'project:manage_members');
  const [selected, setSelected] = useState<UserLookupResult | null>(null);
  const [role, setRole] = useState<ProjectRole>('DEVELOPER');
  const [pendingRemoval, setPendingRemoval] = useState<ProjectMember | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);

  const progressByUser = new Map((progress.data?.members ?? []).map((row) => [row.userId, row]));
  const toggleExpanded = (userId: string) =>
    setExpanded((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));

  const handleAdd = () => {
    setFormError(null);
    if (!selected) {
      setFormError('Choose a user to add.');
      return;
    }
    addMember.mutate(
      { userId: selected.id, projectRole: role },
      {
        onSuccess: () => {
          toast.success('Member added', `${selected.displayName} can now access ${project.code}.`);
          setSelected(null);
          setRole('DEVELOPER');
        },
        onError: (error) => setFormError(error.message),
      },
    );
  };

  const handleRoleChange = (member: ProjectMember, projectRole: ProjectRole) => {
    updateRole.mutate(
      { userId: member.userId, projectRole },
      {
        onSuccess: () => toast.success('Role updated', `${member.displayName} is now ${PROJECT_ROLE_LABELS[projectRole]}.`),
        onError: (error) => toast.error('Could not update role', error.message),
      },
    );
  };

  return (
    <div className="space-y-5">
      {canManage && (
        <Card>
          <CardHeader title="Add a member" description="Only active accounts can be added to a project." />
          <CardBody className="space-y-3">
            {formError && <Alert variant="error">{formError}</Alert>}
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <UserPicker
                label="User"
                value={selected}
                onChange={setSelected}
                excludeIds={(members.data?.members ?? []).map((member) => member.userId)}
                limit={20}
              />
              <Select
                label="Project role"
                options={PROJECT_ROLE_OPTIONS}
                value={role}
                onChange={(event) => setRole(event.target.value as ProjectRole)}
              />
              <Button onClick={handleAdd} loading={addMember.isPending} className="sm:mb-0">
                Add member
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Team"
          description={`${members.data?.members.length ?? 0} member${(members.data?.members.length ?? 0) === 1 ? '' : 's'}`}
        />
        {members.isLoading && (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        )}
        {members.isError && (
          <CardBody>
            <ErrorState title="Could not load members" description={members.error.message} onRetry={() => members.refetch()} />
          </CardBody>
        )}
        {!members.isLoading && !members.isError && (members.data?.members.length ?? 0) === 0 && (
          <CardBody>
            <EmptyState title="No members yet" description="Add teammates so they can access this project." />
          </CardBody>
        )}
        {(members.data?.members.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="px-5 py-2.5 font-medium">Member</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Global role</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Project role</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Task progress</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Added</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.data!.members.map((member) => {
                  const isSelf = member.userId === me.data?.id;
                  const locked = member.isProjectManager || isSelf;
                  const row = progressByUser.get(member.userId);
                  const isOpen = expanded.includes(member.userId);
                  const panelId = `member-tasks-${member.userId}`;
                  return (
                    <Fragment key={member.userId}>
                      <tr>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={member.displayName} src={member.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                                {member.displayName}
                                {isSelf && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                          {GLOBAL_ROLE_LABELS[member.globalRole]}
                        </td>
                        <td className="px-5 py-3">
                          {member.isProjectManager ? (
                            <Badge variant="indigo">Manager</Badge>
                          ) : canManage && !locked ? (
                            <Select
                              label=""
                              aria-label={`Project role for ${member.displayName}`}
                              className="w-36"
                              options={PROJECT_ROLE_OPTIONS}
                              value={member.projectRole}
                              disabled={updateRole.isPending}
                              onChange={(event) => handleRoleChange(member, event.target.value as ProjectRole)}
                            />
                          ) : (
                            <Badge variant="neutral">{PROJECT_ROLE_LABELS[member.projectRole]}</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {progress.isLoading ? (
                            <Skeleton className="h-3 w-28" />
                          ) : row && row.assigned > 0 ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="w-24">
                                <ProgressBar value={row.averageProgress} label={`${member.displayName} progress`} />
                              </div>
                              <span className="w-9 text-right text-xs tabular-nums font-medium text-slate-600 dark:text-slate-300">
                                {row.averageProgress}%
                              </span>
                              {row.overdue > 0 && <Badge variant="danger">{row.overdue} overdue</Badge>}
                              <button
                                type="button"
                                onClick={() => toggleExpanded(member.userId)}
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
                              >
                                {isOpen ? (
                                  <ChevronDownIcon className="text-sm" />
                                ) : (
                                  <ChevronRightIcon className="text-sm" />
                                )}
                                {isOpen ? 'Hide tasks' : 'View tasks'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No assigned tasks</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDate(member.createdAt)}</td>
                        <td className="px-5 py-3 text-right">
                          {canManage && !member.isProjectManager && !isSelf && (
                            <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(member)}>
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                      {isOpen && row && (
                        <tr id={panelId} className="bg-slate-50/70 dark:bg-slate-800/30">
                          <td colSpan={6} className="px-5 py-3">
                            {row.tasks.length === 0 ? (
                              <p className="text-sm text-slate-500 dark:text-slate-400">No tasks assigned.</p>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {row.tasks.length} task{row.tasks.length === 1 ? '' : 's'} · avg progress{' '}
                                  {row.averageProgress}%
                                </p>
                                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                                  {row.tasks.map((task) => (
                                    <li key={task.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                                      <Link to={`/tasks/${task.id}`} className="min-w-[200px] flex-1">
                                        <span className="mr-2 font-mono text-[11px] text-slate-400">{task.displayKey}</span>
                                        <span className="text-sm text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
                                          {task.title}
                                        </span>
                                      </Link>
                                      <TaskStatusBadge status={task.status} />
                                      <TaskPriorityBadge priority={task.priority} />
                                      <span
                                        className={cn(
                                          'w-24 text-xs',
                                          task.isOverdue
                                            ? 'font-medium text-red-600 dark:text-red-400'
                                            : 'text-slate-500 dark:text-slate-400',
                                        )}
                                      >
                                        {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                                      </span>
                                      <div className="w-24">
                                        <ProgressBar value={task.progress} label={`${task.displayKey} progress`} />
                                      </div>
                                      <span className="w-9 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                        {Math.round(task.progress)}%
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Remove member"
        description={
          pendingRemoval
            ? `Remove ${pendingRemoval.displayName} from ${project.code}? They will lose access to this project immediately.`
            : ''
        }
        confirmLabel="Remove"
        loading={removeMember.isPending}
        onConfirm={() => {
          if (!pendingRemoval) return;
          removeMember.mutate(pendingRemoval.userId, {
            onSuccess: () => {
              toast.success('Member removed', `${pendingRemoval.displayName} no longer has access.`);
              setPendingRemoval(null);
            },
            onError: (error) => {
              toast.error('Could not remove member', error.message);
              setPendingRemoval(null);
            },
          });
        }}
        onClose={() => setPendingRemoval(null)}
      />
    </div>
  );
}
