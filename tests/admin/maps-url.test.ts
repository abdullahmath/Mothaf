import { describe, expect, it } from 'vitest';
import { mapsUrlSchema } from '@/server/domain/admin/destinations';

/**
 * The value lands in a public href, so the schema is the security boundary:
 * only https links on Google's own map hosts may get through.
 */
describe('mapsUrlSchema', () => {
  it.each([
    'https://maps.app.goo.gl/abc123XYZ',
    'https://www.google.com/maps/place/Jableh/@35.36,35.92,17z',
    'https://google.com/maps?q=35.36,35.92',
    'https://maps.google.com/?q=35.36,35.92',
    'https://goo.gl/maps/abc123',
  ])('accepts %s', (url) => {
    expect(mapsUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'http://maps.app.goo.gl/abc',
    'https://evil.example/maps/place',
    'https://www.google.com/search?q=maps',
    'https://goo.gl/somethingelse',
    'https://maps.app.goo.gl.evil.example/x',
    'not a url',
  ])('rejects %s', (url) => {
    expect(mapsUrlSchema.safeParse(url).success).toBe(false);
  });
});
