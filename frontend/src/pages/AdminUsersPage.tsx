import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Pagination } from '../components/ui/Pagination';
import { Select } from '../components/ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { UserFormModal } from '../components/users/UserFormModal';
import { TempPasswordModal } from '../components/users/TempPasswordModal';
import { useMe } from '../features/auth/queries';
import { GLOBAL_ROLE_LABELS, GLOBAL_ROLE_OPTIONS } from '../features/users/constants';
import { useChangeUserRole, useDeleteUser, useResetUserPassword, useUpdateUser, useUsers } from '../features/users/queries';
import type { UserFilters, UserSummary } from '../features/users/types';
import { useDebounce } from '../hooks/useDebounce';
import { formatDateTime } from '../lib/format';
import { toast } from '../stores/toastStore';
import type { GlobalRole } from '../features/auth/types';

const PAGE_SIZE = 20;

export function AdminUsersPage() {
  const me = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ password: string; user: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserSummary | null>(null);
  const [pendingReset, setPendingReset] = useState<UserSummary | null>(null);

  const debouncedSearch = useDebounce(searchInput, 350);
  const role = (searchParams.get('role') ?? '') as GlobalRole | '';
  const isActive = (searchParams.get('active') ?? '') as 'true' | 'false' | '';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const filters: UserFilters = {
    search: debouncedSearch || undefined,
    role: role || undefined,
    isActive: isActive || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const users = useUsers(filters);
  const changeRole = useChangeUserRole();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const deleteUser = useDeleteUser();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const items = users.data?.data.users ?? [];
  const totalPages = Number(users.data?.meta.totalPages ?? 1);
  const total = Number(users.data?.meta.total ?? items.length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Users</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} account{total === 1 ? '' : 's'} · roles, activation and password resets
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New user</Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[220px] flex-1">
          <Input
            label="Search"
            placeholder="Name or email"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              const next = new URLSearchParams(searchParams);
              if (event.target.value) next.set('q', event.target.value);
              else next.delete('q');
              next.delete('page');
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
        <div className="w-52">
          <Select
            label="Global role"
            placeholder="All roles"
            options={GLOBAL_ROLE_OPTIONS}
            value={role}
            onChange={(event) => setParam('role', event.target.value || null)}
          />
        </div>
        <div className="w-40">
          <Select
            label="Status"
            placeholder="All"
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
            value={isActive}
            onChange={(event) => setParam('active', event.target.value || null)}
          />
        </div>
      </div>

      <Card>
        <CardHeader title="Accounts" description="Only administrators can manage users." />
        {users.isLoading && (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        )}
        {users.isError && (
          <CardBody>
            <ErrorState title="Could not load users" description={users.error.message} onRetry={() => users.refetch()} />
          </CardBody>
        )}
        {!users.isLoading && !users.isError && items.length === 0 && (
          <CardBody>
            <EmptyState title="No users match these filters" />
          </CardBody>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="px-5 py-2.5 font-medium">User</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Global role</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Projects</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Last sign-in</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((user) => {
                  const isSelf = user.id === me.data?.id;
                  return (
                    <tr key={user.id} className={user.isActive ? undefined : 'opacity-60'}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                              {user.displayName}
                              {isSelf && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Select
                          label=""
                          aria-label={`Global role for ${user.displayName}`}
                          className="w-44"
                          options={GLOBAL_ROLE_OPTIONS}
                          value={user.globalRole}
                          disabled={isSelf || changeRole.isPending}
                          onChange={(event) => {
                            const globalRole = event.target.value as GlobalRole;
                            changeRole.mutate(
                              { userId: user.id, globalRole },
                              {
                                onSuccess: () => toast.success('Role updated', `${user.displayName} is now ${GLOBAL_ROLE_LABELS[globalRole]}.`),
                                onError: (error) => toast.error('Could not change role', error.message),
                              },
                            );
                          }}
                        />
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{user.projectCount}</td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                      </td>
                      <td className="px-5 py-3">
                        {user.isActive ? (
                          <Badge variant="success">
                            {user.mustChangePassword ? 'Active · temp password' : 'Active'}
                          </Badge>
                        ) : (
                          <Badge variant="danger">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!user.isActive || isSelf}
                            onClick={() =>
                              updateUser.mutate(
                                { userId: user.id, isActive: !user.isActive },
                                {
                                  onSuccess: () => toast.success(user.isActive ? 'User deactivated' : 'User activated'),
                                  onError: (error) => toast.error('Could not update user', error.message),
                                },
                              )
                            }
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!user.isActive}
                            onClick={() => setPendingReset(user)}
                          >
                            Reset password
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            onClick={() => setPendingDelete(user)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <CardBody className="border-t border-slate-100 dark:border-slate-800">
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={(next) => setParam('page', String(next))} />
        </CardBody>
      </Card>

      <UserFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(password) => {
          if (password) setTempPassword({ password, user: 'the new user' });
        }}
      />

      <TempPasswordModal
        open={Boolean(tempPassword)}
        password={tempPassword?.password ?? null}
        forUser={tempPassword?.user ?? ''}
        onClose={() => setTempPassword(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingReset)}
        title="Reset password"
        description={
          pendingReset
            ? `Generate a new temporary password for ${pendingReset.displayName}? All their sessions will be signed out.`
            : ''
        }
        confirmLabel="Reset password"
        variant="primary"
        loading={resetPassword.isPending}
        onConfirm={() => {
          if (!pendingReset) return;
          const target = pendingReset;
          resetPassword.mutate(target.id, {
            onSuccess: (result) => {
              setPendingReset(null);
              setTempPassword({ password: result.temporaryPassword, user: target.displayName });
            },
            onError: (error) => {
              toast.error('Could not reset password', error.message);
              setPendingReset(null);
            },
          });
        }}
        onClose={() => setPendingReset(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete user"
        description={
          pendingDelete
            ? `Delete ${pendingDelete.displayName}? The account is deactivated, sessions are revoked and project memberships removed.`
            : ''
        }
        confirmLabel="Delete user"
        loading={deleteUser.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const target = pendingDelete;
          deleteUser.mutate(
            { userId: target.id },
            {
              onSuccess: () => {
                toast.success('User deleted', `${target.displayName} can no longer sign in.`);
                setPendingDelete(null);
              },
              onError: (error) => {
                toast.error('Could not delete user', error.message);
                setPendingDelete(null);
              },
            },
          );
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
