import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getAuthContext } from '@/server/auth/cookies';
import { permissionsFor } from '@/server/auth/permissions';
import { getTranslator, isAppLocale } from '@/lib/i18n';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * The gate.
 *
 * Everything under `(protected)` requires a session, checked here on the
 * server on every request. The redirect carries the requested path so a
 * bookmarked deep link survives signing in.
 *
 * This is a convenience, not the security boundary. Each domain service
 * performs its own `requirePermission`, so a page that forgot to check — or a
 * Server Action invoked directly, without ever rendering a page — is still
 * refused.
 */
export default async function ProtectedAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  const auth = await getAuthContext();
  if (!auth) redirect(`/${locale}/admin/login`);

  const t = getTranslator(locale);

  return (
    <AdminShell
      locale={locale}
      user={auth.user}
      permissions={[...permissionsFor(auth.user.role)]}
      labels={{
        title: t('admin.title'),
        dashboard: t('admin.dashboard'),
        destinations: t('admin.destinations'),
        tours: t('admin.tours'),
        pois: t('admin.pois'),
        media: t('admin.media'),
        events: t('admin.events'),
        analytics: t('admin.analytics'),
        signOut: t('auth.signOut'),
        viewSite: t('admin.preview'),
      }}
    >
      {children}
    </AdminShell>
  );
}
