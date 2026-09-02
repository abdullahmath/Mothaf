import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { auditLog, users } from '../../db/schema';
import { hashIdentifier } from '../../auth/crypto';
import { verifyPassword } from '../../auth/password';
import { accountKey, consumeRateLimit, ipKey, RATE_LIMITS } from '../../auth/rate-limit';
import { createSession, revokeAllSessionsForUser } from '../../auth/session';
import { DomainError, rateLimited, validation } from '../errors';

/**
 * Sign-in.
 *
 * The rule that shapes this whole function: an unauthenticated caller must
 * learn nothing about which accounts exist. Unknown email, wrong password,
 * suspended account and locked account all produce the same message and, as
 * far as is practical, the same amount of work — `verifyPassword` hashes a
 * decoy when there is no user, so the timing does not separate the cases.
 */

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginContext = {
  ip: string;
  userAgent: string | null;
};

export type LoginResult = {
  token: string;
  userId: string;
  role: string;
};

/** The one message every failure path returns. */
const GENERIC_FAILURE = 'Invalid email address or password';

export async function login(input: LoginInput, context: LoginContext): Promise<LoginResult> {
  const db = await getDb();
  const email = normalizeEmail(input.email);

  // Two independent limits: one stops a single host spraying many accounts,
  // the other stops a distributed attack concentrating on one account.
  const byIp = await consumeRateLimit(ipKey('login', context.ip), RATE_LIMITS.loginPerIp);
  if (!byIp.allowed) throw rateLimited(byIp.retryAfterSeconds);

  const byAccount = await consumeRateLimit(
    accountKey('login', email),
    RATE_LIMITS.loginPerAccount,
  );
  if (!byAccount.allowed) throw rateLimited(byAccount.retryAfterSeconds);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const now = new Date();
  const isLocked = user?.lockedUntil != null && user.lockedUntil > now;

  // Always run the verification, even when the account is missing or locked,
  // so every path costs the same Argon2 computation.
  const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? null);

  if (!user || !passwordMatches || isLocked || user.status !== 'active') {
    if (user && !isLocked && user.status === 'active') {
      await registerFailedAttempt(user.id, user.failedLoginCount);
    }
    await audit(null, 'auth.login.failed', context.ip, { email });
    throw validation(GENERIC_FAILURE, { email: GENERIC_FAILURE, password: GENERIC_FAILURE });
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
    .where(eq(users.id, user.id));

  const { token } = await createSession(user.id, {
    ip: context.ip,
    userAgent: context.userAgent,
  });

  await audit(user.id, 'auth.login.succeeded', context.ip, {});

  return { token, userId: user.id, role: user.role };
}

async function registerFailedAttempt(userId: string, currentCount: number): Promise<void> {
  const db = await getDb();
  const next = currentCount + 1;
  await db
    .update(users)
    .set({
      failedLoginCount: next,
      // Temporary lock, not permanent: a permanent lock turns a failed attack
      // into a successful denial of service against the real owner.
      lockedUntil: next >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null,
    })
    .where(eq(users.id, userId));
}

async function audit(
  actorId: string | null,
  action: string,
  ip: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db.insert(auditLog).values({
    actorId,
    action,
    ipHash: hashIdentifier(ip),
    metadata,
  });
}

/**
 * Changes a password and signs every session out.
 *
 * If the old password was captured, the attacker's session must die at the
 * moment the owner changes it — otherwise the change is theatre.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPasswordHash: string,
): Promise<void> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new DomainError('not_found', 'User not found');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw validation('Current password is incorrect', { currentPassword: 'Incorrect password' });
  }

  await db
    .update(users)
    .set({ passwordHash: newPasswordHash, updatedAt: sql`now()` })
    .where(eq(users.id, userId));

  await revokeAllSessionsForUser(userId);
}
