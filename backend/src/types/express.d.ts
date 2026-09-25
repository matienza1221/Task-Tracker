import type { Session, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user (set by requireAuth). */
      user?: User;
      /** Active session row (set by requireAuth). */
      session?: Session;
      /** Values parsed by the validate() middleware. */
      validated: {
        params: Record<string, unknown>;
        query: Record<string, unknown>;
        body: Record<string, unknown>;
      };
      /** Request id from pino-http. */
      id?: string;
    }
  }
}

export {};
