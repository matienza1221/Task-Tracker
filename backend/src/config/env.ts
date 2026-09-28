import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Allow running from backend/ (docker, CI) or repo root with the shared .env.
dotenv.config({
  path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../.env')],
  override: false,
  quiet: true,
});

const booleanish = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string(), z.undefined()])
    .transform((value) => {
      if (value === undefined || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    })
    .pipe(z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  // Required — fail fast at boot when missing.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Session / cookies
  SESSION_COOKIE_NAME: z.string().min(1).default('teamboard_session'),
  CSRF_COOKIE_NAME: z.string().min(1).default('teamboard_csrf'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(2160).default(168),
  SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  COOKIE_SECURE: booleanish(false),

  // Network
  CORS_ORIGIN: z.string().default(''),
  TRUST_PROXY: booleanish(false),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(300_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  PASSWORD_RESET_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(3),

  // Features
  ENABLE_PUBLIC_REGISTRATION: booleanish(false),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  UPLOAD_DIR: z.string().default('./uploads'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),

  // Links used in outbound mail (password reset)
  APP_URL: z.string().default('https://localhost:5180'),

  // Seed (used by prisma/seed.ts only)
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_PROJECT_CODE: z.string().default('WEBAPP'),
  SEED_TIMEZONE: z.string().default('Asia/Manila'),

  // Reminders
  SCHEDULER_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  DUE_SOON_DAYS: z.coerce.number().int().min(0).max(30).default(2),

  // Ops
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SCHEDULER_ENABLED: booleanish(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Do not log values — only the invalid keys.
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n  - ');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n  - ${issues}`);
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';

export const env = {
  ...raw,
  isProduction,
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  // Secure cookies by default in production; overridable for local plain-HTTP work.
  cookieSecure: raw.COOKIE_SECURE || isProduction,
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
