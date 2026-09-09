import type { MetadataRoute } from 'next';
import { env } from '@/server/config/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/*/admin' },
    sitemap: `${env().APP_ORIGIN}/sitemap.xml`,
  };
}
