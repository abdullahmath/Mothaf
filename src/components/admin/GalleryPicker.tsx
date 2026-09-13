export type GalleryMediaOption = { value: string; label: string; thumbUrl?: string };

/**
 * A visual multi-select for a media gallery.
 *
 * Reused by every content type that carries a gallery (heritage sites,
 * POIs, events) rather than three copies of the same checkbox grid. Plain
 * checkboxes with a `peer`-driven overlay, so selection state needs no
 * client-side script — the same reasoning behind this project's other
 * checkbox-only toggles (DangerZone's confirm field, the admin nav burger).
 */
export function GalleryPicker({
  name,
  options,
  selected,
}: {
  name: string;
  options: GalleryMediaOption[];
  selected: string[];
}) {
  if (options.length === 0) {
    return <p className="text-sm text-lime-faint">Upload images to the media library first.</p>;
  }

  return (
    <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-[var(--hairline)] p-3 sm:grid-cols-3 lg:grid-cols-4">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={[
              'group relative overflow-hidden rounded-md border transition-colors',
              checked
                ? 'border-verdigris'
                : 'border-[var(--hairline)] hover:border-[color-mix(in_oklab,var(--color-lime)_25%,transparent)]',
            ].join(' ')}
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={checked}
              className="peer sr-only"
            />
            {option.thumbUrl ? (
              <img src={option.thumbUrl} alt="" loading="lazy" className="aspect-4/3 w-full object-cover" />
            ) : (
              <div className="aspect-4/3 w-full bg-stone" />
            )}
            <span
              className="pointer-events-none absolute inset-0 transition-colors peer-checked:bg-[color-mix(in_oklab,var(--color-verdigris)_28%,transparent)]"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute end-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-white/40 bg-black/40 text-[10px] text-transparent backdrop-blur peer-checked:border-verdigris peer-checked:bg-verdigris peer-checked:text-ink"
              aria-hidden="true"
            >
              ✓
            </span>
            <span className="block truncate bg-ink-raised px-1.5 py-1 text-2xs text-lime-faint">
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
