import Link from 'next/link';

/**
 * Standard admin page frame: a header with an optional back link and actions,
 * then the content column.
 *
 * Exists so every screen shares the same measure, spacing and heading level.
 * Without it each page invents its own, and an admin built page by page always
 * ends up looking assembled rather than designed.
 */
export function AdminPage({
  title,
  description,
  backHref,
  backLabel,
  actions,
  children,
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8 border-b border-[var(--hairline)] pb-5">
        {backHref && (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-lime-faint transition-colors hover:text-lime"
          >
            <span aria-hidden="true" className="rtl:rotate-180">
              ←
            </span>
            {backLabel}
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display text-2xl text-lime sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 max-w-2xl text-sm text-lime-dim">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      </header>

      {children}
    </div>
  );
}

/** Consistent empty state: says what is missing and offers the way forward. */
export function EmptyState({
  message,
  actionHref,
  actionLabel,
}: {
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-[var(--hairline)] px-6 py-12 text-center">
      <p className="text-sm text-lime-dim">{message}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn btn-primary mt-5">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span className="status-pill" data-status={status}>
      {label}
    </span>
  );
}
