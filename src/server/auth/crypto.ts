import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/** Opaque, unguessable token for sessions and password resets. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Hash stored in place of a session token.
 *
 * Plain SHA-256 is correct here — the input is 256 bits of entropy we
 * generated, so there is nothing to brute-force and no need for a slow KDF.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Keyed hash for values we must be able to compare but must never be able to
 * read back, such as a client IP used for rate limiting and abuse detection.
 * Keying it with the application secret means a database leak does not allow
 * recovering addresses by hashing the whole IPv4 space.
 */
export function hashIdentifier(value: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(value).digest('hex');
}

/**
 * Daily-rotating visitor hash for analytics.
 *
 * The date is part of the key, so the same visitor produces a different hash
 * tomorrow and two days of events cannot be joined into a profile — by us or
 * by anyone who obtains the database.
 */
export function analyticsVisitorHash(ip: string, userAgent: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return createHmac('sha256', `${env().ANALYTICS_SALT}:${day}`)
    .update(`${ip}|${userAgent}`)
    .digest('hex');
}

/** Constant-time comparison for secrets of equal expected length. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
