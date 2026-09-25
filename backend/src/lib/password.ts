import { randomInt } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters per ARCHITECTURE.md decision D2.
 * 19 MiB memory, 2 iterations, 1 lane.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password123',
    'password1234',
    'passw0rd',
    'qwerty123456',
    '123456789012',
    'letmein12345',
    'administrator',
    'administrator1',
    'changeme1234',
    'welcome12345',
    'iloveyou1234',
    'monkey123456',
    'dragon123456',
    'football1234',
    'baseball1234',
    'sunshine1234',
    'princess1234',
    'trustno1',
    'abc123456789',
  ].map((value) => value.toLowerCase()),
);

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    // Malformed hash, wrong parameters, etc. → treat as a failed verification.
    return false;
  }
}

/**
 * A valid Argon2id hash for a random value, used to equalize response timing
 * when an account does not exist (prevents user enumeration).
 */
let dummyHashPromise: Promise<string> | null = null;
export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(`not-a-real-password-${Date.now()}-${Math.random()}`);
  return dummyHashPromise;
}

/**
 * Cryptographically strong temporary password for admin-created or
 * admin-reset accounts. Guarantees at least one character from each class.
 */
export function generateTemporaryPassword(length = 20): string {
  const sets = [
    'abcdefghijkmnopqrstuvwxyz',
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    '23456789',
    '!@#$%^&*-_=+',
  ];
  const all = sets.join('');
  const chars = sets.map((set) => set[randomInt(set.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface PasswordStrengthContext {
  email?: string;
  displayName?: string;
}

/**
 * Returns a list of problems; an empty list means the password is acceptable.
 * Rules: 12+ chars, at least 3 of 4 character classes, not a known common
 * password, and not derived from the account's own identifiers.
 */
export function validatePasswordStrength(password: string, context: PasswordStrengthContext = {}): string[] {
  const problems: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`);
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (classes < 3) {
    problems.push('Password must include at least three of: lowercase, uppercase, digits, symbols.');
  }

  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered.replace(/[^a-z0-9]/g, ''))) {
    problems.push('Password is too common.');
  }

  for (const identifier of [context.email?.split('@')[0], context.displayName]) {
    const normalized = identifier?.trim().toLowerCase();
    if (normalized && normalized.length >= 4 && lowered.includes(normalized)) {
      problems.push('Password must not contain your email or display name.');
      break;
    }
  }

  return problems;
}
