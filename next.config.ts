import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * The CSP is intentionally strict: no inline scripts, no eval, no framing.
 * `'unsafe-inline'` is permitted for styles only because Next.js injects
 * critical CSS inline during streaming; script-src has no such exemption.
 */
const isProd = process.env.NODE_ENV === 'production';

const csp = [
  "default-src 'self'",
  // Next.js dev needs eval for React Refresh; production does not.
  isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // blob: is required by the panorama engine for progressive texture decode.
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  isProd ? 'upgrade-insecure-requests' : '',
]
  .filter(Boolean)
  .join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
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
