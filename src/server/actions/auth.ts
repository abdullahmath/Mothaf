'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  assertSameOrigin,
  clearSessionCookie,
  getAuthContext,
  getClientIp,
  getUserAgent,
  readSessionToken,
  setSessionCookie,
} from '../auth/cookies';
import { revokeSession } from '../auth/session';
import { changePassword, login } from '../domain/auth/login';
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password';
import { isDomainError } from '../domain/errors';
import { fail, field, recordAudit, type ActionResult } from '../domain/admin/shared';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/config';

/**
 * Authentication actions.
 *
 * Next.js Server Actions already carry an origin check, but `assertSameOrigin`
 * is called explicitly here rather than relied upon implicitly: sign-in is the
 * one endpoint where a cross-site POST would be most valuable to an attacker,
 * and a control that important should be visible in the code that needs it.
 */

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').max(320),
  password: z.string().min(1, 'Enter your password').max(256),
  locale: z.string().optional(),
  next: z.string().optional(),
});

/**
 * Where to send a user after signing in.
 *
 * Only same-site absolute paths are honoured. Echoing back an arbitrary
 * `next` value would make the login form an open redirect — a standard way to
 * lend a phishing link the credibility of a real domain.
 */
function safeRedirect(next: string | undefined, locale: string): string {
  const fallback = `/${locale}/admin`;
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

export async function loginAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const rawPassword = formData.get('password');

  const parsed = loginSchema.safeParse({
    email: field(formData, 'email'),
    // Read raw, deliberately: `field` trims, and silently stripping a space
    // someone chose to put in their password would reject a correct
    // credential for a reason they could never see.
    password: typeof rawPassword === 'string' ? rawPassword : undefined,
    locale: field(formData, 'locale'),
    next: field(formData, 'next'),
  });

  if (!parsed.success) {
    return { ok: false, message: 'Enter your email address and password.' };
  }

  const locale = isAppLocale(parsed.data.locale) ? parsed.data.locale : DEFAULT_LOCALE;

  let token: string;
  try {
    const result = await login(
      { email: parsed.data.email, password: parsed.data.password },
      { ip: await getClientIp(), userAgent: await getUserAgent() },
    );
    token = result.token;
  } catch (error) {
    if (isDomainError(error)) {
      if (error.code === 'rate_limited') {
        return {
          ok: false,
          message: `Too many attempts. Try again in ${error.retryAfterSeconds ?? 60} seconds.`,
        };
      }
      // Every credential failure returns the same message, whatever the
      // underlying reason, so the form cannot be used to discover which
      // accounts exist.
      return { ok: false, message: 'Email address or password is incorrect.' };
    }
    throw error;
  }

  await setSessionCookie(token);
  // `redirect` throws internally, so it must sit outside the try block above.
  redirect(safeRedirect(parsed.data.next, locale));
}

export async function logoutAction(formData: FormData): Promise<void> {
  await assertSameOrigin();

  const token = await readSessionToken();
  if (token) await revokeSession(token);
  await clearSessionCookie();

  await recordAudit({ actorId: null, action: 'auth.logout' });

  const rawLocale = field(formData, 'locale');
  const locale = isAppLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  redirect(`/${locale}/admin/login`);
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  });

/**
 * Self-service password change.
 *
 * The user id comes from the caller's own session — never from a form
 * field — so this can only ever change the signed-in admin's own password,
 * not one supplied by the client. `changePassword` itself revokes every
 * session for the account once the current password is confirmed, this
 * one's included, so signing out and sending them back to the login page is
 * not a courtesy: the cookie they are holding is already dead.
 */
export async function changePasswordAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const auth = await getAuthContext();
  if (!auth) return fail('Your session has expired. Please sign in again.');

  const locale = (() => {
    const raw = field(formData, 'locale');
    return isAppLocale(raw) ? raw : DEFAULT_LOCALE;
  })();

  // Read raw, not trimmed — same reasoning as the login form: silently
  // stripping a space someone chose to type would reject a correct
  // credential for a reason they could never see.
  const rawCurrent = formData.get('currentPassword');
  const rawNew = formData.get('newPassword');
  const rawConfirm = formData.get('confirmPassword');

  const parsed = changePasswordSchema.safeParse({
    currentPassword: typeof rawCurrent === 'string' ? rawCurrent : '',
    newPassword: typeof rawNew === 'string' ? rawNew : '',
    confirmPassword: typeof rawConfirm === 'string' ? rawConfirm : '',
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    return fail('Please check the highlighted fields.', fields);
  }

  try {
    const newPasswordHash = await hashPassword(parsed.data.newPassword);
    await changePassword(auth.user.id, parsed.data.currentPassword, newPasswordHash);
  } catch (error) {
    if (isDomainError(error)) {
      if (error.code === 'rate_limited') {
        return fail(`Too many attempts. Try again in ${error.retryAfterSeconds ?? 60} seconds.`);
      }
      return fail(error.message, error.fields);
    }
    console.error('[action] unexpected failure changing password', error);
    return fail('Something went wrong. Please try again.');
  }

  await clearSessionCookie();
  redirect(`/${locale}/admin/login?passwordChanged=1`);
}
