import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST must be set to run backend tests (copy backend/.env.example to backend/.env).');
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // The suite shares one PostgreSQL database, so files run sequentially.
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      LOG_LEVEL: 'silent',
      COOKIE_SECURE: 'false',
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '1000',
      PASSWORD_RESET_RATE_LIMIT_MAX: '1000',
      CORS_ORIGIN: 'https://app.example.com',
      APP_URL: 'https://app.example.com',
      TRUST_PROXY: 'false',
      ENABLE_PUBLIC_REGISTRATION: 'false',
      UPLOAD_DIR: './.test-uploads',
      MAX_UPLOAD_MB: '2',
      SCHEDULER_ENABLED: 'false',
      DUE_SOON_DAYS: '2',
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
