import 'server-only';

import { cookies, headers } from 'next/headers';
import { env } from '../config/env';
import { ABSOLUTE_LIFETIME_MS, resolveSession, type AuthContext } from './session';

/**
 * Cookie plumbing. Kept apart from `session.ts` so the session logic itself
 * carries no framework dependency and can be tested directly.
 */

const isSecureContext = () => env().APP_ORIGIN.startsWith('https://');

/**
 * `__Host-` is the strictest cookie prefix: the browser only accepts it when
 * it is Secure, path-scoped to `/`, and carries no Domain attribute — which
 * means a sibling subdomain cannot overwrite it. It requires HTTPS, so plain
 * development over http falls back to an unprefixed name.
 */
export function sessionCookieName(): string {
  return isSecureContext() ? '__Host-mothaf_session' : 'mothaf_session';
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureContext(),
    // `Lax` still sends the cookie on a top-level navigation back from an
    // external link, which `Strict` would break, while withholding it from
    // cross-site form posts. CSRF is defended by origin + token checks; this
    // is depth, not the control.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ABSOLUTE_LIFETIME_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), '', {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(sessionCookieName())?.value ?? null;
}

/** The signed-in user for this request, or `null`. */
export async function getAuthContext(): Promise<AuthContext | null> {
  return resolveSession(await readSessionToken());
}

/**
 * Best-effort client IP.
 *
 * Only meaningful behind a proxy that sets these headers *and* strips
 * client-supplied copies. It is used for rate limiting and salted hashes, never
 * for authorization, precisely because a client can lie about it.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? '0.0.0.0';
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get('user-agent');
}

/**
 * Cross-origin request guard for state-changing handlers.
 *
 * Server Actions and mutating routes must originate from our own page. The
 * `Origin` header is set by the browser on every cross-site POST and cannot be
 * forged by page JavaScript, which makes this a reliable CSRF control in its
 * own right.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  // Same-origin GET-like navigations may omit Origin entirely; only reject a
  // header that is present and wrong.
  if (origin && origin !== env().APP_ORIGIN) {
    throw new Error(`Cross-origin request refused: ${origin}`);
  }
}
