import 'server-only';

import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { firstRow } from '../db/raw';
import { hashIdentifier } from './crypto';

/**
 * Token-bucket rate limiting, held in Postgres so a limit still holds when the
 * application runs on more than one instance. An in-process counter would let
 * an attacker multiply their allowance by the number of replicas.
 */

export type RateLimitRule = {
  /** Maximum burst. */
  capacity: number;
  /** Tokens restored per second — the sustained rate. */
  refillPerSecond: number;
  /** Tokens this attempt costs. */
  cost?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export const RATE_LIMITS = {
  /** 5 attempts, then roughly one more every 30 s. */
  loginPerIp: { capacity: 10, refillPerSecond: 1 / 30 },
  loginPerAccount: { capacity: 5, refillPerSecond: 1 / 60 },
  /** Uploads are expensive: 20 up front, one every 6 s after that. */
  upload: { capacity: 20, refillPerSecond: 1 / 6 },
  passwordReset: { capacity: 3, refillPerSecond: 1 / 300 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Atomically refills and consumes.
 *
 * The whole operation is one statement. Postgres takes a row lock for the
 * `DO UPDATE` branch, so concurrent attempts on the same key serialise and
 * cannot each read the same pre-refill balance.
 *
 * A denied attempt still moves the balance (floored at -1) so that hammering
 * the endpoint does not reset the clock, while the floor keeps the penalty
 * bounded — otherwise an attacker could lock a victim out indefinitely by
 * spraying attempts at their account.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const db = await getDb();
  const cost = rule.cost ?? 1;
  const { capacity, refillPerSecond } = rule;

  const result = await db.execute(sql`
    INSERT INTO rate_limits AS r (key, tokens, updated_at)
    VALUES (${key}, ${capacity - cost}, now())
    ON CONFLICT (key) DO UPDATE SET
      tokens = GREATEST(
        LEAST(
          ${capacity}::double precision,
          r.tokens + EXTRACT(EPOCH FROM (now() - r.updated_at)) * ${refillPerSecond}::double precision
        ) - ${cost}::double precision,
        -1::double precision
      ),
      updated_at = now()
    RETURNING r.tokens AS remaining
  `);

  const row = firstRow<{ remaining: number | string }>(result);
  const remaining = Number(row?.remaining ?? -1);
  const allowed = remaining >= 0;

  return {
    allowed,
    remaining: Math.max(0, remaining),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((cost - remaining) / Math.max(refillPerSecond, 1e-6))),
  };
}

/** Namespaced key for an IP-scoped limit. The address itself is never stored. */
export function ipKey(scope: string, ip: string): string {
  return `${scope}:ip:${hashIdentifier(ip).slice(0, 32)}`;
}

/** Namespaced key for an account-scoped limit. */
export function accountKey(scope: string, identifier: string): string {
  return `${scope}:account:${hashIdentifier(identifier.toLowerCase()).slice(0, 32)}`;
}

/** Removes expired buckets. Safe to call from a scheduled job. */
export async function pruneRateLimits(olderThanHours = 24): Promise<void> {
  const db = await getDb();
  await db.execute(
    sql`DELETE FROM rate_limits WHERE updated_at < now() - (${olderThanHours} * interval '1 hour')`,
  );
}
