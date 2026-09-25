export type GlobalRole = 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER' | 'VIEWER';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  timezone: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  permissions: string[];
}

export interface UserPayload {
  user: AuthUser;
}

export function can(user: AuthUser | undefined, permission: string): boolean {
  return user?.permissions.includes(permission) ?? false;
}
