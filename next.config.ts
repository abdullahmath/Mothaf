import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * The Content-Security-Policy is set in middleware.ts, not here: it needs a
 * fresh nonce per request so script-src can stay free of 'unsafe-inline'
 * while still allowing the inline hydration scripts Next.js itself streams
 * into the page.
 */
const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    // Gyroscope is requested explicitly by the panorama viewer on mobile.
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), gyroscope=(self), accelerometer=(self)',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Native modules must not be bundled into the server build.
  serverExternalPackages: ['sharp', '@node-rs/argon2', 'postgres', '@electric-sql/pglite'],

  images: {
    formats: ['image/avif', 'image/webp'],
    // All media is served from our own origin through the media route.
    remotePatterns: [],
  },

  experimental: {
    // Cap the body a Server Action will accept; large media goes through the
    // dedicated upload route which streams and validates instead.
    serverActions: { bodySizeLimit: '2mb' },
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Content-addressed media derivatives are immutable.
        source: '/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
