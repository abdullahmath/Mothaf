'use client';

import { useEffect, useRef } from 'react';
import type { Translator } from '@/lib/i18n';

/**
 * The detail surface that opens over a scene.
 *
 * Built on the native `<dialog>` element, which brings focus containment, an
 * Escape handler, `aria-modal`, and inert background content without a
 * hand-rolled focus trap — every one of which is easy to get subtly wrong.
 *
 * Styled as a sheet anchored to the inline-end edge on wide screens and a
 * bottom sheet on narrow ones, with a backdrop that darkens rather than hides.
 * Keeping the scene visible behind the panel is the point: the visitor should
 * never lose their sense of where they are standing while they read.
 */
export function TourPanel({
  open,
  onClose,
  title,
  eyebrow,
  children,
  t,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  t: Translator;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Escape and the backdrop both fire `close`; route them through the same
    // callback so the parent's state cannot drift out of sync with the DOM.
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className="tour-panel panel"
      onClick={(event) => {
        // A click that lands on the dialog element itself — not on its
        // content — is a click on the backdrop area.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start gap-4 border-b border-[var(--hairline)] p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            <h2 className="display text-2xl text-lime">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-quiet -mt-1 shrink-0 px-3"
            aria-label={t('a11y.closeDialog')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </dialog>
  );
}
