import 'server-only';

import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * Password hashing.
 *
 * Argon2id at the OWASP-recommended second configuration (19 MiB, 2
 * iterations, 1 lane). Memory-hardness is what makes offline cracking of a
 * leaked hash expensive, which is the threat that matters here — the
 * comparison itself is never the bottleneck.
 *
 * The algorithm is written as its numeric value because `@node-rs/argon2`
 * declares `Algorithm` as an ambient `const enum`, which `isolatedModules`
 * forbids importing as a value.
 */
const ALGORITHM_ARGON2ID = 2;

const ARGON2_OPTIONS: Options = {
  algorithm: ALGORITHM_ARGON2ID,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

/**
 * A real Argon2id hash of a value nobody knows, used to burn the same CPU time
 * when the account does not exist. Without it, "no such user" returns in
 * microseconds while "wrong password" takes ~50 ms, and that difference is a
 * reliable account-enumeration oracle.
 *
 * Computed once, lazily, so importing this module stays cheap.
 */
let decoyHash: Promise<string> | undefined;

function getDecoyHash(): Promise<string> {
  decoyHash ??= hash('argon2id-timing-equalisation-decoy', ARGON2_OPTIONS);
  return decoyHash;
}

export const PASSWORD_MIN_LENGTH = 12;
/**
 * Argon2 has no practical input limit, but an unbounded password is a cheap
 * way to make the server do arbitrary work.
 */
export const PASSWORD_MAX_LENGTH = 256;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (plaintext.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  return hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verifies a password against a stored hash.
 *
 * Pass `null` for `storedHash` when the account was not found: the decoy hash
 * is verified instead, so the response time is indistinguishable.
 */
export async function verifyPassword(
  plaintext: string,
  storedHash: string | null,
): Promise<boolean> {
  if (plaintext.length > PASSWORD_MAX_LENGTH) {
    // Still spend the time, then refuse.
    await verify(await getDecoyHash(), 'x').catch(() => false);
    return false;
  }

  if (storedHash === null) {
    await verify(await getDecoyHash(), plaintext).catch(() => false);
    return false;
  }

  try {
    return await verify(storedHash, plaintext);
  } catch {
    // A malformed hash in the database must read as "wrong password", never as
    // an unhandled error that leaks the state of the record.
    return false;
  }
}
