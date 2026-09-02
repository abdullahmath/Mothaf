import { Amiri, Fraunces, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from 'next/font/google';

/**
 * Typefaces, self-hosted.
 *
 * `next/font` downloads these at build time and serves them from our own
 * origin. That keeps the CSP free of a third-party font host, removes a
 * render-blocking round trip, and means no visitor request is made to Google
 * — which matters for a public cultural site with a privacy-first stance.
 *
 * Three roles:
 *   display  — Fraunces (Latin) / Amiri (Arabic)
 *   UI       — IBM Plex Sans Arabic, which covers both scripts so a page that
 *              mixes them keeps one set of metrics
 *   data     — IBM Plex Mono, for bearings, coordinates, dates and counts
 *
 * Amiri rather than the more usual Cairo or Tajawal: it is a naskh face
 * modelled on the Bulaq press types, which belongs to the same scholarly
 * print tradition as the material the platform presents.
 */

export const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  // Loaded as a variable font: no `weight` list, so the whole axis is
  // available and `axes` may be declared alongside it. SOFT and WONK are what
  // give Fraunces its character; opsz keeps large display sizes from looking
  // spindly.
  axes: ['SOFT', 'WONK', 'opsz'],
});

export const amiri = Amiri({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-amiri',
  weight: ['400', '700'],
});

export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-plex-arabic',
  weight: ['300', '400', '500', '600'],
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  weight: ['400', '500'],
});

/** Applied to <html> so every token in globals.css resolves. */
export const fontVariables = [
  fraunces.variable,
  amiri.variable,
  plexArabic.variable,
  plexMono.variable,
].join(' ');
