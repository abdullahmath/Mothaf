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

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (EXCLUDED.some((pattern) => pattern.test(pathname))) {
    return NextResponse.next();
  }

  const segments = pathname.split('/');
  const first = segments[1];

  if (isAppLocale(first)) {
    return NextResponse.next();
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
