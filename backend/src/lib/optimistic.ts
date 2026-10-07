import { Prisma } from '@prisma/client';
import { conflict } from './errors';

/**
 * Prisma reports a version-guarded write that matched no row as a generic
 * "record not found" (P2025). For an optimistic-concurrency check that is not a
 * missing resource but a stale edit, so it must surface as a 409.
 */
function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/**
 * Runs a write whose `where` clause includes the expected `version`. The check
 * and the write happen in the same statement, so two concurrent callers can
 * never both pass the version check and silently overwrite each other. A stale
 * version throws the supplied conflict.
 */
export async function optimisticWrite<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isRecordNotFound(error)) throw conflict(message);
    throw error;
  }
}
