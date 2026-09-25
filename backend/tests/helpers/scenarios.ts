import type { GlobalRole, User } from '@prisma/client';
import { createTestUser, TEST_PASSWORD } from './db';
import { loginAs, type SessionClient } from './auth';
import type { Express } from 'express';

export interface UserWithSession {
  user: User & { plainPassword: string };
  client: SessionClient;
}

export async function createUserWithSession(
  app: Express,
  options: { email: string; globalRole?: GlobalRole; displayName?: string },
): Promise<UserWithSession> {
  const user = await createTestUser(options);
  const client = await loginAs(app, user.email, TEST_PASSWORD);
  return { user, client };
}
