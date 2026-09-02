'use client';

import { useState } from 'react';
import type { AppLocale } from '@/lib/i18n/config';

/**
 * Irreversible actions, separated from the form above them.
 *
 * The confirmation is a typed word rather than a dialog. Deleting a
 * destination cascades to its tours, scenes, hotspots, points of interest and
 * events, and a single misplaced click should not be able to do that. Typing
 * makes the person read the sentence.
 */
export function DangerZone({
  action,
  id,
  locale,
  label,
  warning,
  confirmWord = 'DELETE',
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  locale: AppLocale;
  label: string;
  warning: string;
  confirmWord?: string;
}) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toUpperCase() === confirmWord;

  return (
    <section className="mt-16 rounded-md border border-[color-mix(in_oklab,var(--color-danger)_35%,transparent)] p-5">
      <h2 className="eyebrow mb-2" style={{ color: 'var(--color-danger)' }}>
        {label}
      </h2>
      <p className="mb-4 max-w-prose text-sm text-lime-dim">{warning}</p>

      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="locale" value={locale} />

        <label className="grid gap-1.5">
          <span className="text-xs text-lime-faint">
            Type {confirmWord} to confirm
          </span>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="admin-input"
            data-latin="true"
            aria-describedby="danger-help"
          />
        </label>

        <button
          type="submit"
          disabled={!armed}
          className="btn"
          style={{
            background: armed ? 'var(--color-danger)' : 'transparent',
            color: armed ? 'var(--color-ink)' : 'var(--color-lime-faint)',
            borderColor: 'var(--color-danger)',
          }}
        >
          {label}
        </button>
      </form>
      <p id="danger-help" className="visually-hidden">
        The button becomes available once the confirmation word is typed exactly.
      </p>
    </section>
  );
}
