/**
 * The mark is the theatre's own geometry: three concentric arcs of a cavea
 * around a single focal point. It is the same shape as a panorama's field of
 * view seen from above, which is the idea the whole product rests on.
 */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 19a8.5 8.5 0 0 1 17 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M6.75 19a5.25 5.25 0 0 1 10.5 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.72"
      />
      <path
        d="M10 19a2 2 0 0 1 4 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" />
    </svg>
  );
}
