import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Single Prisma client per process. In development the client is cached on
 * globalThis so `tsx watch` restarts do not exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
