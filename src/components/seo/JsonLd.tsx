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
      // Browsers deliberately hide a script's nonce value from later reads
      // (getAttribute, cloneNode) once it has been applied — a defence against
      // an XSS payload harvesting nonces off the page. React's hydration check
      // then sees "" where the server sent the real value and flags a
      // mismatch that isn't one; suppressing it here is the documented fix.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
