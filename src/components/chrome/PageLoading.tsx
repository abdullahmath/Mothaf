/**
 * Fallback shown by `loading.tsx` while a page's server data resolves.
 *
 * Every content page fetches on request (`dynamic = 'force-dynamic'`, see
 * `server/domain/public/cache.ts` for why), so a slow connection would
 * otherwise leave the content area blank between navigations. This has no
 * text — `loading.tsx` cannot read the locale segment, since it renders
 * before params resolve — so it stays purely visual, matching the theme
 * rather than saying anything in one language only.
 */
export function PageLoading() {
  return (
    <div className="grid min-h-[50dvh] place-items-center px-5" role="status" aria-label="Loading">
      <div className="flex gap-2">
        <span className="loading-dot" style={{ animationDelay: '0ms' }} />
        <span className="loading-dot" style={{ animationDelay: '160ms' }} />
        <span className="loading-dot" style={{ animationDelay: '320ms' }} />
      </div>
    </div>
  );
}
