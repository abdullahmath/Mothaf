/**
 * The immersive frame.
 *
 * No header, no footer, no page scroll. A tour occupies the whole viewport and
 * supplies its own navigation, so any surrounding chrome would compete with it
 * and shrink the very thing the visitor came for.
 *
 * `overflow: hidden` is applied here rather than globally: locking scroll for
 * the whole application would break every other page, and doing it from
 * JavaScript on mount would leave the page stuck if the component unmounted
 * unexpectedly.
 */
export default function ImmersiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh w-full overflow-hidden" data-immersive="true">
      {children}
    </div>
  );
}
