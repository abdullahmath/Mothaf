import { Readable } from 'node:stream';
import type { ReadableStream as WebStream } from 'node:stream/web';
import { AwsClient } from 'aws4fetch';
import {
  assertSafeKey,
  type ByteRange,
  type ObjectMeta,
  type StorageDriver,
  type StoredObject,
} from './types';

export type S3Config = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
};

/**
 * S3-compatible object storage (Supabase Storage, Cloudflare R2, Backblaze B2,
 * AWS). Path-style addressing, which every one of them accepts; requests are
 * signed with aws4fetch rather than pulling in the full AWS SDK.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(private readonly config: S3Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: 's3',
    });
    const endpoint = (config.endpoint ?? `https://s3.${config.region}.amazonaws.com`).replace(/\/+$/, '');
    this.base = `${endpoint}/${config.bucket}`;
  }

  private url(key: string): string {
    assertSafeKey(key);
    return `${this.base}/${key}`;
  }

  async put(key: string, body: Buffer, meta: ObjectMeta): Promise<void> {
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: {
        'Content-Type': meta.contentType,
        ...(meta.cacheControl ? { 'Cache-Control': meta.cacheControl } : {}),
      },
    });
    if (!res.ok) throw new Error(`S3 put ${key} failed: ${res.status} ${await res.text()}`);
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject | null> {
    const res = await this.client.fetch(this.url(key), {
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {},
    });
    if (res.status === 404 || res.status === 416) return null;
    if (!res.ok || !res.body) throw new Error(`S3 get ${key} failed: ${res.status}`);

    const length = res.headers.get('content-length');
    const total = res.headers.get('content-range')?.split('/')[1] ?? length;
    return {
      stream: Readable.fromWeb(res.body as unknown as WebStream),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: length ? Number(length) : null,
      totalLength: total && total !== '*' ? Number(total) : null,
      etag: res.headers.get('etag'),
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`S3 delete ${key} failed: ${res.status}`);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.fetch(this.url(key), { method: 'HEAD' });
    return res.ok;
  }

  /** Direct URL only when a public base is configured; otherwise proxied. */
  publicUrl(key: string): string | null {
    assertSafeKey(key);
    return this.config.publicBaseUrl
      ? `${this.config.publicBaseUrl.replace(/\/+$/, '')}/${key}`
      : null;
  }
}
