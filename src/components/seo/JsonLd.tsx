import { headers } from 'next/headers';

/**
 * Renders a schema.org structured-data block.
 *
 * `<` is escaped to its unicode form so a title or description containing a
 * literal `</script>` cannot break out of the tag — the data here always
 * traces back to editor-entered content, not a hardcoded string, so it is
 * treated the same as any other untrusted text at a serialization boundary.
 *
 * CSP's script-src gates every `<script>` element, ld+json included, so this
 * carries the same per-request nonce middleware.ts issues to Next's own
 * inline hydration scripts — without it the browser silently drops the block.
 */
export async function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
