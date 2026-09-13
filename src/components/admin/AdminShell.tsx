import Link from 'next/link';
import type { Permission } from '@/server/auth/permissions';
import type { AuthUser } from '@/server/auth/session';
import type { AppLocale } from '@/lib/i18n/config';
import { Wordmark } from '../chrome/Wordmark';
import { LocaleSwitcher } from '../chrome/LocaleSwitcher';
import { LogoutButton } from './LogoutButton';

/**
 * Admin frame: a persistent sidebar and a content column.
 *
 * Navigation entries are filtered by the signed-in user's permissions, so an
 * analyst never sees an editing section they cannot use. That is courtesy
 * only — the server refuses the action regardless of what the menu showed.
 */
/**
 * Named explicitly rather than as `Record<string, string>`: with
 * `noUncheckedIndexedAccess` an index signature makes every lookup
 * `string | undefined`, and the compiler stops catching a typo'd key — which
 * is the main thing a label map should protect against.
 */
export type AdminShellLabels = {
  title: string;
  dashboard: string;
  destinations: string;
  tours: string;
  pois: string;
  heritageSites: string;
  media: string;
  events: string;
  analytics: string;
  account: string;
  signOut: string;
  viewSite: string;
  languageSwitcher: string;
};

export function AdminShell({
  locale,
  user,
  permissions,
  labels,
  children,
}: {
  locale: AppLocale;
  user: AuthUser;
  permissions: Permission[];
  labels: AdminShellLabels;
  children: React.ReactNode;
}) {
  const can = (permission: Permission) => permissions.includes(permission);

  const items = [
    { href: `/${locale}/admin`, label: labels.dashboard, show: true },
    {
      href: `/${locale}/admin/destinations`,
      label: labels.destinations,
      show: can('content:read'),
    },
    { href: `/${locale}/admin/tours`, label: labels.tours, show: can('content:read') },
    { href: `/${locale}/admin/pois`, label: labels.pois, show: can('content:read') },
    {
      href: `/${locale}/admin/heritage-sites`,
      label: labels.heritageSites,
      show: can('content:read'),
    },
    { href: `/${locale}/admin/media`, label: labels.media, show: can('media:read') },
    { href: `/${locale}/admin/events`, label: labels.events, show: can('event:read') },
    { href: `/${locale}/admin/analytics`, label: labels.analytics, show: can('analytics:read') },
  ].filter((item) => item.show);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-[var(--hairline)] md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-e">
        <div className="flex h-full flex-col p-4">
          {/* Mobile only: the sidebar's nav list is long enough that leaving
              it always expanded would push every page's content below the
              fold before a visitor sees any of it. A plain checkbox toggle,
              so collapsing it needs no client-side script. */}
          <input type="checkbox" id="admin-nav-toggle" className="peer sr-only" />

          <div className="mb-2 flex items-center justify-between md:mb-6">
            <Link
              href={`/${locale}/admin`}
              className="flex items-center gap-2.5 px-2 text-lime transition-colors hover:text-verdigris-bright"
            >
              <Wordmark size={20} />
              <span className="display text-base">{labels.title}</span>
            </Link>

            <label
              htmlFor="admin-nav-toggle"
              className="admin-nav-burger grid h-9 w-9 place-items-center peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-verdigris)] md:hidden"
              aria-label={labels.title}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </label>
          </div>

          <div className="hidden peer-checked:flex peer-checked:flex-col md:flex md:min-h-0 md:flex-1 md:flex-col">
            <nav aria-label={labels.title} className="grid gap-0.5 pb-2 md:pb-0">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-2 text-sm text-lime-dim transition-colors hover:bg-[color-mix(in_oklab,var(--color-lime)_6%,transparent)] hover:text-lime"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="grid gap-2 border-t border-[var(--hairline)] pt-4 md:mt-auto">
              <div className="px-2.5">
                <LocaleSwitcher locale={locale} label={labels.languageSwitcher} />
              </div>
              <Link
                href={`/${locale}`}
                className="rounded-md px-2.5 py-2 text-sm text-lime-faint transition-colors hover:text-lime"
              >
                {labels.viewSite} ↗
              </Link>
              <div className="px-2.5 pt-1">
                <Link
                  href={`/${locale}/admin/account`}
                  className="block truncate text-sm text-lime transition-colors hover:text-verdigris-bright"
                >
                  {user.displayName}
                </Link>
                <p className="readout truncate" dir="ltr">
                  {user.email}
                </p>
                <p className="mt-1 text-2xs text-lime-faint">{user.role.replace('_', ' ')}</p>
              </div>
              <Link
                href={`/${locale}/admin/account`}
                className="rounded-md px-2.5 py-2 text-sm text-lime-faint transition-colors hover:text-lime"
              >
                {labels.account}
              </Link>
              <LogoutButton locale={locale} label={labels.signOut} />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
