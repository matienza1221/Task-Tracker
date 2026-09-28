import { useState } from 'react';
import { Alert } from '../../ui/Alert';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Select } from '../../ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import { UserPicker } from '../../ui/UserPicker';
import { useAddMember, useMembers, useRemoveMember, useUpdateMemberRole } from '../../../features/projects/queries';
import { projectRoleCan } from '../../../features/auth/roles';
import { useMe } from '../../../features/auth/queries';
import { PROJECT_ROLE_LABELS, PROJECT_ROLE_OPTIONS, type ProjectRole } from '../../../features/users/constants';
import type { UserLookupResult } from '../../../features/users/types';
import type { Project, ProjectMember } from '../../../features/projects/types';
import { GLOBAL_ROLE_LABELS } from '../../../features/users/constants';
import { formatDate } from '../../../lib/format';
import { toast } from '../../../stores/toastStore';

export function MembersTab({ project }: { project: Project }) {
  const me = useMe();
  const members = useMembers(project.id);
  const addMember = useAddMember(project.id);
  const updateRole = useUpdateMemberRole(project.id);
  const removeMember = useRemoveMember(project.id);

  const canManage = projectRoleCan(project.myRole, 'project:manage_members');
  const [selected, setSelected] = useState<UserLookupResult | null>(null);
  const [role, setRole] = useState<ProjectRole>('DEVELOPER');
  const [pendingRemoval, setPendingRemoval] = useState<ProjectMember | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
                  <th scope="col" className="px-5 py-2.5 font-medium">Added</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.data!.members.map((member) => {
                  const isSelf = member.userId === me.data?.id;
                  const locked = member.isProjectManager || isSelf;
                  return (
                    <tr key={member.userId}>
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
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDate(member.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {canManage && !member.isProjectManager && !isSelf && (
                          <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(member)}>
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
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
