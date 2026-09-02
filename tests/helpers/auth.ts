import { vi } from 'vitest';
import type { AuthContext, AuthUser } from '@/server/db/../auth/session';

/**
 * Lets a test run domain services as a chosen user.
 *
 * `requirePermission` reads the session from the request cookies, which do not
 * exist outside a request. Rather than stubbing the permission check itself —
 * which would mean the tests no longer exercise the thing they are meant to
 * verify — only the cookie layer is replaced. Everything above it, including
 * the whole role/permission matrix and every `requirePermission` call, is the
 * real code.
 */

export type TestActor = { id: string; role: AuthUser['role'] } | null;

let currentActor: TestActor = null;

export function actAs(actor: TestActor): void {
  currentActor = actor;
}

export function currentAuthContext(): AuthContext | null {
  if (!currentActor) return null;
  return {
    sessionId: 'test-session',
    user: {
      id: currentActor.id,
      email: `${currentActor.role}@test.local`,
      displayName: 'Test Actor',
      role: currentActor.role,
      preferredLocale: 'en',
    },
  };
}

/**
 * Installs the mock. Must be called at module scope in a test file, before the
 * modules under test are imported, because `vi.mock` is hoisted.
 */
export function mockAuthCookies(): void {
  vi.mock('@/server/auth/cookies', async () => {
    const helpers = await import('./auth');
    return {
      getAuthContext: async () => helpers.currentAuthContext(),
      getClientIp: async () => '203.0.113.10',
      getUserAgent: async () => 'vitest',
      assertSameOrigin: async () => undefined,
      setSessionCookie: async () => undefined,
      clearSessionCookie: async () => undefined,
      readSessionToken: async () => null,
      sessionCookieName: () => 'mothaf_session',
    };
  });
}
