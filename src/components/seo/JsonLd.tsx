/**
 * Renders a schema.org structured-data block.
 *
 * `<` is escaped to its unicode form so a title or description containing a
 * literal `</script>` cannot break out of the tag — the data here always
 * traces back to editor-entered content, not a hardcoded string, so it is
 * treated the same as any other untrusted text at a serialization boundary.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
