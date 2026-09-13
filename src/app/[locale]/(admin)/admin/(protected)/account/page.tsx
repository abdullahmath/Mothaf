import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getAuthContext } from '@/server/auth/cookies';
import { AdminPage } from '@/components/admin/AdminPage';
import { ChangePasswordForm } from '@/components/admin/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  // The (protected) layout already redirects an unauthenticated visitor;
  // this only needs the account to show its own details.
  const auth = await getAuthContext();
  if (!auth) notFound();

  return (
    <AdminPage title={t('admin.account')}>
      <div className="max-w-md">
        <div className="mb-10 grid gap-1 border-b border-[var(--hairline)] pb-6">
          <p className="text-sm text-lime">{auth.user.displayName}</p>
          <p className="readout" dir="ltr">
            {auth.user.email}
          </p>
          <p className="mt-1 text-2xs text-lime-faint">{auth.user.role.replace('_', ' ')}</p>
        </div>

        <h2 className="eyebrow mb-4">Change password</h2>
        <ChangePasswordForm locale={locale} />
      </div>
    </AdminPage>
  );
}
