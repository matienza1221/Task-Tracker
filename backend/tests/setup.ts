import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { prisma } from '../src/db/prisma';
import { resetDatabase } from './helpers/db';

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
  // Remove files written by attachment tests.
  await rm(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? './.test-uploads'), {
    recursive: true,
    force: true,
  });
});
