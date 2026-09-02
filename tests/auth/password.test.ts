import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/server/auth/password';
import { analyticsVisitorHash, generateToken, hashToken, safeEqual } from '@/server/auth/crypto';

/**
 * Password and token handling.
 *
 * Argon2 is deliberately slow, so this file is the slowest in the suite. That
 * cost is the point — a hash cheap enough to test quickly would be cheap
 * enough to crack.
 */

describe('password hashing', () => {
  it('produces an argon2id hash, never the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('the same password twice'),
      hashPassword('the same password twice'),
    ]);
    expect(a).not.toBe(b);
    // Both must still verify — different salt, same password.
    expect(await verifyPassword('the same password twice', a)).toBe(true);
    expect(await verifyPassword('the same password twice', b)).toBe(true);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('a sufficiently long password');
    expect(await verifyPassword('a sufficiently long password', hash)).toBe(true);
    expect(await verifyPassword('a sufficiently long passwore', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('refuses to hash a password below the minimum length', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least/i);
    await expect(hashPassword('x'.repeat(PASSWORD_MIN_LENGTH - 1))).rejects.toThrow();
    await expect(hashPassword('x'.repeat(PASSWORD_MIN_LENGTH))).resolves.toMatch(/^\$argon2id\$/);
  });

  it('refuses an unbounded password, which would be free server work', async () => {
    await expect(hashPassword('x'.repeat(PASSWORD_MAX_LENGTH + 1))).rejects.toThrow(/at most/i);
  });

  it('returns false rather than throwing on a corrupted stored hash', async () => {
    // A malformed row must read as "wrong password", not as a 500 that
    // reveals the state of the record.
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', '$argon2id$v=19$garbage')).toBe(false);
  });

  it('spends comparable time on a missing account as on a wrong password', async () => {
    // The decoy hash exists so that "no such user" cannot be distinguished
    // from "wrong password" by timing. The bound is loose because CI timing is
    // noisy; the failure this catches is the order-of-magnitude one, where a
    // null hash returns in microseconds.
    const hash = await hashPassword('a sufficiently long password');

    const timeOf = async (stored: string | null) => {
      const started = process.hrtime.bigint();
      await verifyPassword('some candidate password', stored);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    // Warm up, so the first Argon2 call's setup cost is not attributed to one
    // side of the comparison.
    await timeOf(hash);
    await timeOf(null);

    const withUser = await timeOf(hash);
    const withoutUser = await timeOf(null);

    expect(withoutUser).toBeGreaterThan(withUser * 0.25);
    expect(withoutUser).toBeLessThan(withUser * 4);
  });
});

describe('tokens', () => {
  it('generates unguessable, unique tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
    // 32 bytes of base64url is 43 characters.
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes a token deterministically and irreversibly', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });

  it('compares in constant time and rejects a length mismatch', () => {
    expect(safeEqual('abcdef', 'abcdef')).toBe(true);
    expect(safeEqual('abcdef', 'abcdeg')).toBe(false);
    expect(safeEqual('abc', 'abcdef')).toBe(false);
  });
});

describe('analytics visitor hash', () => {
  const ip = '198.51.100.7';
  const ua = 'Mozilla/5.0 (test)';

  it('is stable within a day', () => {
    const day = new Date('2026-05-01T09:00:00Z');
    const later = new Date('2026-05-01T23:59:00Z');
    expect(analyticsVisitorHash(ip, ua, day)).toBe(analyticsVisitorHash(ip, ua, later));
  });

  it('changes the next day, so two days cannot be joined into a profile', () => {
    const monday = new Date('2026-05-01T09:00:00Z');
    const tuesday = new Date('2026-05-02T09:00:00Z');
    expect(analyticsVisitorHash(ip, ua, monday)).not.toBe(
      analyticsVisitorHash(ip, ua, tuesday),
    );
  });

  it('separates different visitors on the same day', () => {
    const day = new Date('2026-05-01T09:00:00Z');
    expect(analyticsVisitorHash(ip, ua, day)).not.toBe(
      analyticsVisitorHash('198.51.100.8', ua, day),
    );
    expect(analyticsVisitorHash(ip, ua, day)).not.toBe(
      analyticsVisitorHash(ip, 'a different agent', day),
    );
  });

  it('never contains the address it was derived from', () => {
    const hash = analyticsVisitorHash(ip, ua);
    expect(hash).not.toContain(ip);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
