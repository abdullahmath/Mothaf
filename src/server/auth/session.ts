import 'server-only';

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { sessions, users, type User } from '../db/schema';
import { generateToken, hashIdentifier, hashToken } from './crypto';

/**
 * Server-side session management.
 *
 * Deliberately free of any Next.js import so it can be exercised directly in
 * tests; the cookie plumbing lives in `cookies.ts`.
 *
 * Sessions are opaque tokens looked up in the database rather than signed
 * claims. That costs one indexed query per request and buys immediate
 * revocation — a compromised session, a suspended account or a password change
 * takes effect on the very next request instead of whenever a token happens to
 * expire.
 */

/** Signed out after this long without activity. */
export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
/** Hard ceiling, never extended by activity. */
export const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * `last_seen_at` is only written when it is this stale, so a burst of requests
 * does not turn every page view into a database write.
 */
const LAST_SEEN_WRITE_THRESHOLD_MS = 60 * 1000;

/** The subset of a user that is safe to hold in request context. */
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: User['role'];
  preferredLocale: string | null;
};

export type AuthContext = {
  user: AuthUser;
  sessionId: string;
};

function toAuthUser(row: User): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    preferredLocale: row.preferredLocale,
  };
}

/** Coarse device label for the "your sessions" screen. Never a full UA string. */
function userAgentLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const platform = /android/.test(ua)
    ? 'Android'
    : /iphone|ipad|ipod/.test(ua)
      ? 'iOS'
      : /mac os x/.test(ua)
        ? 'macOS'
        : /windows/.test(ua)
          ? 'Windows'
          : /linux/.test(ua)
            ? 'Linux'
            : 'Unknown';
  const browser = /edg\//.test(ua)
    ? 'Edge'
    : /chrome\//.test(ua)
      ? 'Chrome'
      : /safari\//.test(ua)
        ? 'Safari'
        : /firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser';
  return `${browser} on ${platform}`;
}

export type SessionOrigin = {
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Issues a session. Returns the raw token, which is the only time it exists
 * outside the user's cookie — the database stores only its SHA-256.
 */
export async function createSession(
  userId: string,
  origin: SessionOrigin = {},
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const db = await getDb();
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + ABSOLUTE_LIFETIME_MS);

  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      absoluteExpiresAt: expiresAt,
      ipHash: origin.ip ? hashIdentifier(origin.ip) : null,
      userAgentLabel: userAgentLabel(origin.userAgent),
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error('Failed to create session');
  return { token, expiresAt, sessionId: row.id };
}

/**
 * Validates a token and returns its authentication context.
 *
 * Every condition below is a reason to reject, and all of them are checked on
 * every request rather than only at sign-in.
 */
export async function resolveSession(token: string | null | undefined): Promise<AuthContext | null> {
  if (!token) return null;

  const db = await getDb();
  const now = new Date();

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const found = rows[0];
  if (!found) return null;

  const { session, user } = found;

  if (session.revokedAt !== null) return null;
  if (session.absoluteExpiresAt <= now) return null;
  if (session.lastSeenAt.getTime() + IDLE_TIMEOUT_MS <= now.getTime()) return null;
  if (user.status !== 'active') return null;
  // Invalidated in bulk by a password change or "sign out everywhere".
  if (session.createdAt < user.sessionsValidFrom) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_WRITE_THRESHOLD_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, session.id));
  }

  return { user: toAuthUser(user), sessionId: session.id };
}

export async function revokeSession(token: string): Promise<void> {
  const db = await getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/**
 * Signs a user out everywhere. Called on password change and on suspension.
 *
 * Bumping `sessions_valid_from` invalidates sessions the revoke statement may
 * race with, including any created microseconds later by an in-flight login.
 */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  await db.update(users).set({ sessionsValidFrom: now }).where(eq(users.id, userId));
}

/** Housekeeping: drop rows no longer usable. Safe to run on a schedule. */
export async function pruneExpiredSessions(): Promise<number> {
  const db = await getDb();
  const result = await db
    .delete(sessions)
    .where(
      or(
        lt(sessions.absoluteExpiresAt, new Date()),
        lt(sessions.revokedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        sql`${sessions.lastSeenAt} < now() - interval '30 days'`,
      ),
    );
  return (result as { rowCount?: number }).rowCount ?? 0;
}
