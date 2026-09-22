import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALES, isAppLocale, negotiateLocale } from '@/lib/i18n/config';

/**
 * Locale routing.
 *
 * Every page lives under `/{locale}/…`, so the language is in the URL and a
 * shared link always opens in the language it was shared in. A request without
 * a locale prefix is redirected to one chosen from `Accept-Language`, falling
 * back to Arabic.
 *
 * The cookie only records a *deliberate* switch made with the language
 * control. It is read before content negotiation so a returning visitor keeps
 * their choice, and it never overrides an explicit locale already in the path.
 */

const LOCALE_COOKIE = 'mothaf_locale';

/** Paths that must not be locale-prefixed. */
const EXCLUDED = [/^\/api\//, /^\/media\//, /^\/_next\//, /^\/favicon\./, /^\/robots\.txt$/, /^\/sitemap\.xml$/];

const isProd = process.env.NODE_ENV === 'production';

/**
 * Content-Security-Policy, built fresh per request.
 *
 * script-src carries a random nonce rather than 'unsafe-inline': Next.js
 * reads the nonce off this header and stamps it onto the inline hydration
 * scripts it streams into the page, so those pass CSP while an attacker's
 * injected inline script still doesn't have the nonce to match.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // Next.js dev needs eval for React Refresh; production does not.
    isProd ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'` : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // blob: is required by the panorama engine for progressive texture decode.
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // A destination may optionally embed its own Sketchfab 3D scan
    // (destinations.sketchfab_model_id). The iframe src is always built by us
    // from a validated 32-hex-char id, never from stored HTML, so this origin
    // is the only thing the field can ever cause to be framed.
    "frame-src 'self' https://sketchfab.com",
    "manifest-src 'self'",
    isProd ? 'upgrade-insecure-requests' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Forwards the nonce as a *request* header (not just a response one): the App
 * Router reads it back off the incoming request while rendering, which is
 * what makes it stamp that nonce onto its own inline scripts.
 */
function nextWithCsp(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (EXCLUDED.some((pattern) => pattern.test(pathname))) {
    return nextWithCsp(request);
  }

  const segments = pathname.split('/');
  const first = segments[1];

  if (isAppLocale(first)) {
    return nextWithCsp(request);
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isAppLocale(cookieLocale)
    ? cookieLocale
    : negotiateLocale(request.headers.get('accept-language'));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and files with an extension.
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};

export { LOCALE_COOKIE, LOCALES, DEFAULT_LOCALE };
