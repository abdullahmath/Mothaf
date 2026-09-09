'use client';

import { useState, useTransition } from 'react';
import { setSceneLinksAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';

export function SceneLinksForm({
  sceneId,
  locale,
  siblings,
  initialLinkedIds,
}: {
  sceneId: string;
  locale: AppLocale;
  siblings: { id: string; label: string }[];
  initialLinkedIds: string[];
}) {
  const [selected, setSelected] = useState(new Set(initialLinkedIds));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  };

  const save = () => {
    startTransition(async () => {
      await setSceneLinksAction(sceneId, [...selected], locale);
      setSaved(true);
    });
  };

  if (siblings.length === 0) {
    return <p className="text-sm text-lime-faint">No other scenes in this tour yet.</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {siblings.map((sibling) => (
          <label key={sibling.id} className="flex items-center gap-2.5 text-sm text-lime-dim">
            <input
              type="checkbox"
              checked={selected.has(sibling.id)}
              onChange={() => toggle(sibling.id)}
              className="h-4 w-4 accent-[var(--color-verdigris)]"
            />
            {sibling.label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn btn-quiet">
          {pending ? '…' : 'Save connections'}
        </button>
        {saved && !pending && <span className="text-xs text-verdigris">Saved.</span>}
      </div>
    </div>
  );
}
