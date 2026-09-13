import type { MetadataRoute } from 'next';
import { env } from '@/server/config/env';

// Reads APP_ORIGIN at request time, same reasoning as sitemap.ts: prerendering
// this at build time would force `next build` to run under full production
// environment validation (real secrets, https origin, postgres) rather than
// whatever the build environment happens to have.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/*/admin' },
    sitemap: `${env().APP_ORIGIN}/sitemap.xml`,
  };
}
