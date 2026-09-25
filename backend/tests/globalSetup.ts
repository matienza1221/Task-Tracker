import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Vitest global setup: prepares an isolated test database and applies
 * migrations. Runs once before all test files.
 */
export default async function globalSetup(): Promise<void> {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST must be set (see backend/.env.example) to run the backend test suite.');
  }

  const parsed = new URL(testUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Refusing to create database with unsafe name "${databaseName}".`);
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const rows = await admin.$queryRawUnsafe<{ exists: boolean }[]>(
      'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
      databaseName,
    );
    if (!rows[0]?.exists) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      // eslint-disable-next-line no-console
      console.log(`[test] Created test database "${databaseName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}
