import 'server-only';

import { getAuthContext } from '../auth/cookies';
import { hasPermission, type Permission } from '../auth/permissions';
import type { AuthContext } from '../auth/session';
import { forbidden, unauthenticated } from './errors';

/**
 * The authorization chokepoint.
 *
 * Every mutating domain operation begins with `requirePermission`. Nothing
 * reads a role from a request body, a header, a form field or a client-supplied
 * claim — the role is loaded from the database against the session cookie on
 * each request, so a stale or forged role simply does not exist as a concept.
 *
 * The admin UI also consults the permission matrix to decide what to render.
 * That is a courtesy for the user; this function is the control.
 */

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (!auth) throw unauthenticated();
  return auth;
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!hasPermission(auth.user.role, permission)) {
    throw forbidden(`Missing permission: ${permission}`);
  }
  return auth;
}

/** Any one of the listed permissions is sufficient. */
export async function requireAnyPermission(...permissions: Permission[]): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!permissions.some((p) => hasPermission(auth.user.role, p))) {
    throw forbidden(`Missing one of: ${permissions.join(', ')}`);
  }
  return auth;
}

/** Non-throwing variant, for rendering decisions only. */
export async function can(permission: Permission): Promise<boolean> {
  const auth = await getAuthContext();
  return auth ? hasPermission(auth.user.role, permission) : false;
}
