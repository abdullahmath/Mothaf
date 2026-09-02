import { logoutAction } from '@/server/actions/auth';
import type { AppLocale } from '@/lib/i18n/config';

/**
 * Sign out.
 *
 * A form POST rather than a link. Signing out changes server state, and a GET
 * that mutates can be triggered by anything that prefetches or scans links —
 * including the browser's own prefetcher, which would log people out as they
 * hovered the menu.
 */
export function LogoutButton({ locale, label }: { locale: AppLocale; label: string }) {
  return (
    <form action={logoutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        className="w-full rounded-md px-2.5 py-2 text-start text-sm text-lime-faint transition-colors hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] hover:text-lime"
      >
        {label}
      </button>
    </form>
  );
}
