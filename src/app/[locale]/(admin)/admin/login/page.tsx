import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getAuthContext } from '@/server/auth/cookies';
import { LoginForm } from '@/components/admin/LoginForm';
import { Wordmark } from '@/components/chrome/Wordmark';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  // A sign-in page has nothing to offer a search engine and every reason not
  // to appear in one.
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  // Already signed in: there is nothing to do here.
  const auth = await getAuthContext();
  if (auth) redirect(`/${locale}/admin`);

  const { next } = await searchParams;

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-3 text-lime">
          <Wordmark size={28} />
          <span className="display text-xl">{t('common.appName')}</span>
        </div>

        <h1 className="display text-2xl text-lime">{t('auth.signInTitle')}</h1>
        <p className="mt-2 text-sm text-lime-dim">{t('auth.signInSubtitle')}</p>

        <LoginForm
          locale={locale}
          next={next}
          labels={{
            email: t('auth.email'),
            password: t('auth.password'),
            submit: t('auth.signIn'),
            submitting: t('auth.signingIn'),
          }}
        />
      </div>
    </div>
  );
}
