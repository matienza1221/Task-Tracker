import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit URL-safe random token (session tokens, CSRF tokens, reset tokens). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hex-encoded SHA-256. Tokens are stored only as hashes, never in plaintext. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison for equal-length strings (e.g. hex digests). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Short, non-reversible key used for rate-limit buckets (never raw emails in memory keys). */
export function anonymizedKey(value: string): string {
  return sha256(value.trim().toLowerCase()).slice(0, 24);
}
