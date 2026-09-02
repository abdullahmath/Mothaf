import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, schema, type TestDb } from '../helpers/db';
import { hashPassword } from '@/server/auth/password';
import { login, normalizeEmail } from '@/server/domain/auth/login';
import { isDomainError } from '@/server/domain/errors';
import {
  createSession,
  resolveSession,
  revokeAllSessionsForUser,
  revokeSession,
  IDLE_TIMEOUT_MS,
} from '@/server/auth/session';

/**
 * Sign-in and session lifecycle, against a real database.
 *
 * The properties under test are the ones that matter if someone is attacking
 * the login form: that it reveals nothing about which accounts exist, that
 * repeated attempts are throttled, and that a session stops working the moment
 * it should.
 */

let db: TestDb;
let close: () => Promise<void>;

const PASSWORD = 'a-perfectly-good-password';
const EMAIL = 'curator@example.org';

let userId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  // A clean slate each time: rate-limit buckets and lockout counters carry
  // over otherwise and make later tests fail for the wrong reason.
  await db.delete(schema.sessions);
  await db.delete(schema.auditLog);
  await db.delete(schema.users);
  await db.delete(schema.rateLimits);

  const [user] = await db
    .insert(schema.users)
    .values({
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'Curator',
      role: 'content_editor',
    })
    .returning();
  userId = user!.id;
});

const context = { ip: '203.0.113.5', userAgent: 'vitest' };

describe('email normalization', () => {
  it('lower-cases and trims, so casing cannot create a duplicate account', () => {
    expect(normalizeEmail('  Curator@Example.ORG ')).toBe('curator@example.org');
  });
});

describe('login', () => {
  it('issues a session for correct credentials', async () => {
    const result = await login({ email: EMAIL, password: PASSWORD }, context);
    expect(result.userId).toBe(userId);
    expect(result.token).toBeTruthy();

    const auth = await resolveSession(result.token);
    expect(auth?.user.id).toBe(userId);
    expect(auth?.user.role).toBe('content_editor');
  });

  it('accepts the email in any casing or with surrounding space', async () => {
    await expect(
      login({ email: '  CURATOR@EXAMPLE.ORG  ', password: PASSWORD }, context),
    ).resolves.toBeTruthy();
  });

  it('gives the same message for a wrong password and an unknown account', async () => {
    const wrongPassword = await login({ email: EMAIL, password: 'nope' }, context).catch((e) => e);
    const unknownAccount = await login(
      { email: 'nobody@example.org', password: 'nope' },
      { ...context, ip: '203.0.113.6' },
    ).catch((e) => e);

    expect(isDomainError(wrongPassword)).toBe(true);
    expect(isDomainError(unknownAccount)).toBe(true);
    // Identical wording is what stops the form being used to enumerate
    // which addresses have accounts.
    expect(wrongPassword.message).toBe(unknownAccount.message);
    expect(wrongPassword.code).toBe(unknownAccount.code);
  });

  it('refuses a suspended account, without saying so', async () => {
    // Baseline: what a plain wrong password says.
    const wrongPassword = await login({ email: EMAIL, password: 'wrong' }, context).catch((e) => e);
    await db.delete(schema.rateLimits);

    await db.update(schema.users).set({ status: 'suspended' }).where(eq(schema.users.id, userId));
    const suspended = await login({ email: EMAIL, password: PASSWORD }, context).catch((e) => e);

    expect(isDomainError(suspended)).toBe(true);
    // Word for word the same. "Your account is suspended" would confirm the
    // address is registered and hand an attacker a valid password.
    expect(suspended.message).toBe(wrongPassword.message);
  });

  it('counts failed attempts and locks the account temporarily', async () => {
    // Eight failures trip the lock. The per-account rate limit would bite
    // first, so it is topped up between attempts to isolate the lockout.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await db.delete(schema.rateLimits);
      await login({ email: EMAIL, password: 'wrong' }, context).catch(() => undefined);
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(user!.failedLoginCount).toBeGreaterThanOrEqual(8);
    expect(user!.lockedUntil).not.toBeNull();

    // Even the correct password is refused while the lock stands.
    await db.delete(schema.rateLimits);
    await expect(login({ email: EMAIL, password: PASSWORD }, context)).rejects.toThrow();
  });

  it('is a temporary lock, not a permanent one', async () => {
    // A permanent lock would turn a failed attack into a successful denial of
    // service against the real owner.
    await db
      .update(schema.users)
      .set({ failedLoginCount: 8, lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(schema.users.id, userId));

    await expect(login({ email: EMAIL, password: PASSWORD }, context)).resolves.toBeTruthy();
  });

  it('clears the failure count after a successful sign-in', async () => {
    await login({ email: EMAIL, password: 'wrong' }, context).catch(() => undefined);
    await db.delete(schema.rateLimits);
    await login({ email: EMAIL, password: PASSWORD }, context);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(user!.failedLoginCount).toBe(0);
    expect(user!.lockedUntil).toBeNull();
    expect(user!.lastLoginAt).not.toBeNull();
  });

  it('rate-limits repeated attempts from one address', async () => {
    let limited = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const error = await login({ email: EMAIL, password: 'wrong' }, context).catch((e) => e);
      if (isDomainError(error) && error.code === 'rate_limited') {
        limited = true;
        expect(error.retryAfterSeconds).toBeGreaterThan(0);
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it('records both failures and successes in the audit log', async () => {
    await login({ email: EMAIL, password: 'wrong' }, context).catch(() => undefined);
    await db.delete(schema.rateLimits);
    await login({ email: EMAIL, password: PASSWORD }, context);

    const entries = await db.select().from(schema.auditLog);
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('auth.login.failed');
    expect(actions).toContain('auth.login.succeeded');

    // The address is hashed, never stored in the clear.
    for (const entry of entries) {
      expect(entry.ipHash).not.toBe(context.ip);
      if (entry.ipHash) expect(entry.ipHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('never writes the password or a reversible form of it to the audit log', async () => {
    await login({ email: EMAIL, password: PASSWORD }, context);
    const entries = await db.select().from(schema.auditLog);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(PASSWORD);
  });
});

describe('sessions', () => {
  it('stores only a hash of the token', async () => {
    const { token } = await createSession(userId, context);
    const [row] = await db.select().from(schema.sessions);
    expect(row!.tokenHash).not.toBe(token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an unknown or empty token', async () => {
    expect(await resolveSession('not-a-real-token')).toBeNull();
    expect(await resolveSession('')).toBeNull();
    expect(await resolveSession(null)).toBeNull();
  });

  it('rejects a revoked session immediately', async () => {
    const { token } = await createSession(userId, context);
    expect(await resolveSession(token)).not.toBeNull();

    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it('rejects a session past its absolute expiry', async () => {
    const { token, sessionId } = await createSession(userId, context);
    await db
      .update(schema.sessions)
      .set({ absoluteExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, sessionId));

    expect(await resolveSession(token)).toBeNull();
  });

  it('rejects a session that has been idle too long', async () => {
    const { token, sessionId } = await createSession(userId, context);
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 60_000) })
      .where(eq(schema.sessions.id, sessionId));

    expect(await resolveSession(token)).toBeNull();
  });

  it('rejects every session once the account is suspended', async () => {
    const { token } = await createSession(userId, context);
    await db.update(schema.users).set({ status: 'suspended' }).where(eq(schema.users.id, userId));
    expect(await resolveSession(token)).toBeNull();
  });

  it('signs out everywhere when sessions_valid_from moves forward', async () => {
    const a = await createSession(userId, context);
    const b = await createSession(userId, context);
    expect(await resolveSession(a.token)).not.toBeNull();
    expect(await resolveSession(b.token)).not.toBeNull();

    await revokeAllSessionsForUser(userId);

    expect(await resolveSession(a.token)).toBeNull();
    expect(await resolveSession(b.token)).toBeNull();
  });

  it('invalidates a session created before the cutoff even if not revoked', async () => {
    // Guards the race where a login lands microseconds after "sign out
    // everywhere" runs its UPDATE.
    const { token, sessionId } = await createSession(userId, context);
    await db
      .update(schema.sessions)
      .set({ revokedAt: null, createdAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.sessions.id, sessionId));
    await db
      .update(schema.users)
      .set({ sessionsValidFrom: new Date() })
      .where(eq(schema.users.id, userId));

    expect(await resolveSession(token)).toBeNull();
  });

  it('stores a hash of the address, never the address', async () => {
    await createSession(userId, { ip: '198.51.100.99', userAgent: 'Mozilla/5.0 Chrome/120 Windows' });
    const [row] = await db.select().from(schema.sessions);
    expect(row!.ipHash).not.toBe('198.51.100.99');
    // The user-agent is coarsened to something a person can recognise without
    // it being a fingerprint.
    expect(row!.userAgentLabel).toBe('Chrome on Windows');
  });

  it('advances last-seen only when it is stale, not on every request', async () => {
    const { token, sessionId } = await createSession(userId, context);
    const [before] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    await resolveSession(token);
    const [after] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    // A fresh session should not have been written again.
    expect(after!.lastSeenAt.getTime()).toBe(before!.lastSeenAt.getTime());

    // Age it past the write threshold and it should update.
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: sql`now() - interval '10 minutes'` })
      .where(eq(schema.sessions.id, sessionId));
    await resolveSession(token);

    const [updated] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    expect(updated!.lastSeenAt.getTime()).toBeGreaterThan(before!.lastSeenAt.getTime() - 60_000);
  });
});
