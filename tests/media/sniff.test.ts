import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { clientTypeAgrees, sniffType } from '@/server/media/sniff';

/**
 * Format detection.
 *
 * The single property that matters: what the file *is* comes from its bytes,
 * and never from its name or the browser's declared type. Getting this wrong
 * is how an upload form becomes a way to host attacker-controlled HTML on your
 * own origin.
 */

async function jpeg(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#446688' } })
    .jpeg()
    .toBuffer();
}

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 4, background: '#446688' } })
    .png()
    .toBuffer();
}

describe('sniffType', () => {
  it('recognises the image formats the platform accepts', async () => {
    expect(sniffType(await jpeg())).toMatchObject({ mimeType: 'image/jpeg', category: 'image' });
    expect(sniffType(await png())).toMatchObject({ mimeType: 'image/png', category: 'image' });

    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123' } })
      .webp()
      .toBuffer();
    expect(sniffType(webp)).toMatchObject({ mimeType: 'image/webp', category: 'image' });
  });

  it('recognises audio and video containers', () => {
    const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]);
    expect(sniffType(mp3)).toMatchObject({ mimeType: 'audio/mpeg', category: 'audio' });

    const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(64)]);
    expect(sniffType(ogg)).toMatchObject({ mimeType: 'audio/ogg', category: 'audio' });

    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
    expect(sniffType(webm)).toMatchObject({ mimeType: 'video/webm', category: 'video' });

    // An ISO base-media file: 4 bytes of size, then 'ftyp', then the brand.
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x20]),
      Buffer.from('ftypisom'),
      Buffer.alloc(64),
    ]);
    expect(sniffType(mp4)).toMatchObject({ mimeType: 'video/mp4', category: 'video' });
  });

  it('refuses HTML, however it is named or labelled', () => {
    const html = Buffer.from('<!doctype html><script>alert(document.cookie)</script>');
    expect(sniffType(html)).toBeNull();
  });

  it('refuses an SVG, which is a script container as much as an image', () => {
    // SVG can carry <script>, so it is deliberately absent from the accepted
    // list even though it is legitimately "an image".
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>…</script></svg>');
    expect(sniffType(svg)).toBeNull();
  });

  it('refuses an executable and an archive', () => {
    expect(sniffType(Buffer.from('MZ\x90\x00'))).toBeNull(); // Windows PE
    expect(sniffType(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBeNull(); // ELF
    expect(sniffType(Buffer.from('PK\x03\x04'))).toBeNull(); // zip
  });

  it('refuses an empty or truncated file', () => {
    expect(sniffType(Buffer.alloc(0))).toBeNull();
    expect(sniffType(Buffer.from([0xff]))).toBeNull();
  });

  it('identifies a JPEG that has been renamed and mislabelled', async () => {
    // The browser says PDF, the name says .exe; the bytes say JPEG and the
    // bytes win.
    const sniffed = sniffType(await jpeg());
    expect(sniffed?.mimeType).toBe('image/jpeg');
    expect(clientTypeAgrees(sniffed!, 'application/pdf')).toBe(false);
  });

  it('tolerates the browsers that report image/jpg', async () => {
    const sniffed = sniffType(await jpeg());
    expect(clientTypeAgrees(sniffed!, 'image/jpg')).toBe(true);
    expect(clientTypeAgrees(sniffed!, 'image/jpeg; charset=binary')).toBe(true);
  });

  it('does not treat a polyglot as safe just because it starts like an image', async () => {
    // Appending HTML after valid JPEG data still sniffs as JPEG — which is
    // correct, and is why the pipeline re-encodes rather than storing the
    // uploaded bytes. See ingest.test.ts.
    const polyglot = Buffer.concat([await jpeg(), Buffer.from('<script>alert(1)</script>')]);
    expect(sniffType(polyglot)?.mimeType).toBe('image/jpeg');
  });
});
