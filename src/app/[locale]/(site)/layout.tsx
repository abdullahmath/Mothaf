import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale } from '@/lib/i18n';
import { SiteHeader } from '@/components/chrome/SiteHeader';
import { SiteFooter } from '@/components/chrome/SiteFooter';

/**
 * Chrome for the browsing surfaces: home, destinations, events.
 *
 * The immersive tour deliberately does not use this layout. A persistent
 * header on a 360° scene eats vertical space, gives the visitor a second set
 * of navigation competing with the tour's own, and breaks the sense of being
 * somewhere. Route groups let the two share a document but not a frame.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const t = getTranslator(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      <SiteHeader locale={locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
