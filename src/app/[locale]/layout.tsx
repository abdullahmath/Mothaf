import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import '../globals.css';
import { fontVariables } from '@/lib/fonts';
import { LOCALES, directionOf, getTranslator, isAppLocale } from '@/lib/i18n';

/**
 * Root layout.
 *
 * It lives inside the `[locale]` segment so `lang` and `dir` are set from the
 * URL on the server. Getting those onto `<html>` in the first byte is what
 * makes RTL a property of the document rather than something JavaScript
 * corrects after paint.
 *
 * Deliberately bare: it establishes the document and nothing else. The site
 * chrome belongs to the `(site)` group, because the tour is a full-viewport
 * experience that must not carry a header — see `(immersive)/layout.tsx`.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: '#0b1113',
  width: 'device-width',
  initialScale: 1,
  // Zoom is left available: capping it at 1 would lock out anyone who relies
  // on pinch-zoom to read. The panorama uses `touch-action: none` on its own
  // canvas, which is enough to keep a drag from scrolling the page.
  maximumScale: 5,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = getTranslator(locale);

  return {
    title: {
      default: `${t('common.appName')} — ${t('common.tagline')}`,
      template: `%s · ${t('common.appName')}`,
    },
    description: t('home.heroBody'),
    applicationName: t('common.appName'),
    formatDetection: { telephone: false },
    openGraph: { type: 'website', locale, siteName: t('common.appName') },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  return (
    <html lang={locale} dir={directionOf(locale)} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
