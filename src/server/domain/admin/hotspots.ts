import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  events,
  hotspots,
  hotspotTranslations,
  mediaAssets,
  pointsOfInterest,
  scenes,
  tours,
} from '../../db/schema';
import { requirePermission } from '../guard';
import { notFound, validation } from '../errors';
import { collectReferences, parseActionPayload } from '@/lib/tour/actions';
import type { HotspotActionType } from '@/lib/tour/types';
import { recordAudit, replaceTranslations, statusSchema, type TranslationInput } from './shared';

export const HOTSPOT_TRANSLATION_FIELDS = ['label', 'description'] as const;

export const hotspotInputSchema = z.object({
  sceneId: z.string().uuid(),
  actionType: z.enum([
    'navigate',
    'poi',
    'info',
    'image',
    'gallery',
    'video',
    'audio',
    'event',
    'link',
  ]),
  /** Raw payload from the form; validated against the action registry below. */
  payload: z.record(z.string(), z.unknown()).default({}),
  yawDeg: z.coerce.number().min(-360).max(360).nullable().optional(),
  pitchDeg: z.coerce.number().min(-90).max(90).nullable().optional(),
  x: z.coerce.number().min(0).max(1).nullable().optional(),
  y: z.coerce.number().min(0).max(1).nullable().optional(),
  icon: z.string().trim().max(48).default('dot'),
  style: z.enum(['pin', 'pulse', 'label', 'arrow']).default('pulse'),
  status: statusSchema.default('published'),
});

export type HotspotInput = z.infer<typeof hotspotInputSchema>;

/**
 * Validates a hotspot's action payload and everything it points at.
 *
 * Two separate jobs, and both matter:
 *
 * 1. **Shape** — the payload must satisfy the Zod schema the action registry
 *    declares for its type. A `navigate` hotspot carrying `{url: "..."}` is
 *    rejected here rather than silently ignored at render time.
 *
 * 2. **Scope** — every id it references must exist *and* belong to the same
 *    tour or destination. This is the IDOR check: without it, an editor could
 *    point a hotspot at a scene in another organisation's tour simply by
 *    typing its id into the form, and the reference would resolve.
 */
async function validateAction(
  sceneId: string,
  actionType: HotspotActionType,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const parsed = parseActionPayload(actionType, payload);
  if (!parsed.ok) {
    throw validation(`This hotspot's settings are not valid: ${parsed.error}`, {
      payload: parsed.error,
    });
  }

  const db = await getDb();
  const [scene] = await db
    .select({ tourId: scenes.tourId, destinationId: tours.destinationId })
    .from(scenes)
    .innerJoin(tours, eq(tours.id, scenes.tourId))
    .where(eq(scenes.id, sceneId))
    .limit(1);
  if (!scene) throw notFound('Scene not found');

  for (const { entity, ids } of collectReferences(parsed.type, parsed.payload)) {
    if (ids.length === 0) continue;

    switch (entity) {
      case 'scene': {
        const found = await db
          .select({ id: scenes.id })
          .from(scenes)
          .where(and(inArray(scenes.id, ids), eq(scenes.tourId, scene.tourId)));
        if (found.length !== ids.length) {
          throw validation('That scene is not part of this tour.', {
            payload: 'Choose a scene from this tour',
          });
        }
        break;
      }
      case 'poi': {
        const found = await db
          .select({ id: pointsOfInterest.id })
          .from(pointsOfInterest)
          .where(
            and(
              inArray(pointsOfInterest.id, ids),
              eq(pointsOfInterest.destinationId, scene.destinationId),
            ),
          );
        if (found.length !== ids.length) {
          throw validation('That point of interest belongs to another destination.', {
            payload: 'Choose a point of interest from this destination',
          });
        }
        break;
      }
      case 'event': {
        const found = await db
          .select({ id: events.id })
          .from(events)
          .where(and(inArray(events.id, ids), eq(events.destinationId, scene.destinationId)));
        if (found.length !== ids.length) {
          throw validation('That event belongs to another destination.', {
            payload: 'Choose an event from this destination',
          });
        }
        break;
      }
      case 'media': {
        // Media is a shared library, so existence is the only requirement.
        const found = await db
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(inArray(mediaAssets.id, ids));
        if (found.length !== ids.length) {
          throw validation('One of the selected files no longer exists.', {
            payload: 'Choose a file from the media library',
          });
        }
        break;
      }
    }
  }

  return parsed.payload;
}

/**
 * Placement must match the scene's renderer.
 *
 * A panoramic scene positions by bearing and elevation; a flat scene positions
 * by normalized coordinates. Accepting the wrong pair would store a hotspot
 * that silently never appears, which is far harder to diagnose than a refusal.
 */
function assertPlacement(kind: string, input: HotspotInput): void {
  if (kind === 'panorama') {
    if (input.yawDeg === null || input.yawDeg === undefined) {
      throw validation('Place the marker in the scene first.', {
        placement: 'Click inside the panorama to place this marker',
      });
    }
  } else if (input.x === null || input.x === undefined || input.y === null || input.y === undefined) {
    throw validation('Place the marker in the scene first.', {
      placement: 'Click inside the image to place this marker',
    });
  }
}

export async function createHotspot(
  input: HotspotInput,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  const [scene] = await db
    .select({ kind: scenes.kind })
    .from(scenes)
    .where(eq(scenes.id, input.sceneId))
    .limit(1);
  if (!scene) throw notFound('Scene not found');

  assertPlacement(scene.kind, input);
  const payload = await validateAction(input.sceneId, input.actionType, input.payload);

  const [row] = await db
    .insert(hotspots)
    .values({
      sceneId: input.sceneId,
      actionType: input.actionType,
      actionPayload: payload,
      yawDeg: input.yawDeg ?? null,
      pitchDeg: input.pitchDeg ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      icon: input.icon,
      style: input.style,
      status: input.status,
    })
    .returning({ id: hotspots.id });

  await replaceTranslations({
    table: hotspotTranslations,
    parentColumn: hotspotTranslations.hotspotId,
    parentId: row!.id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'hotspot.create',
    entityType: 'hotspot',
    entityId: row!.id,
    metadata: { sceneId: input.sceneId, actionType: input.actionType },
  });

  return row!.id;
}

export async function updateHotspot(
  id: string,
  input: HotspotInput,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  const [existing] = await db
    .select({ hotspot: hotspots, sceneKind: scenes.kind })
    .from(hotspots)
    .innerJoin(scenes, eq(scenes.id, hotspots.sceneId))
    .where(eq(hotspots.id, id))
    .limit(1);
  if (!existing) throw notFound('Hotspot not found');

  assertPlacement(existing.sceneKind, input);
  // Scope the IDOR check to the hotspot's actual scene, not whatever
  // `sceneId` the form happened to submit — a hotspot never moves between
  // scenes on update, and trusting the client-supplied value here would let
  // a forged field validate a payload against the wrong destination.
  const payload = await validateAction(existing.hotspot.sceneId, input.actionType, input.payload);

  await db
    .update(hotspots)
    .set({
      actionType: input.actionType,
      actionPayload: payload,
      yawDeg: input.yawDeg ?? null,
      pitchDeg: input.pitchDeg ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      icon: input.icon,
      style: input.style,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(hotspots.id, id));

  await replaceTranslations({
    table: hotspotTranslations,
    parentColumn: hotspotTranslations.hotspotId,
    parentId: id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'hotspot.update',
    entityType: 'hotspot',
    entityId: id,
  });
}

/** Moves a marker without touching anything else — used by drag-to-reposition. */
export async function moveHotspot(
  id: string,
  position: { yawDeg?: number; pitchDeg?: number; x?: number; y?: number },
): Promise<void> {
  await requirePermission('content:write');
  const db = await getDb();

  const schema = z.object({
    yawDeg: z.number().min(-360).max(360).optional(),
    pitchDeg: z.number().min(-90).max(90).optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(position);
  if (!parsed.success) throw validation('That position is out of range.');

  await db
    .update(hotspots)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(hotspots.id, id));
}

export async function deleteHotspot(id: string): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();
  await db.delete(hotspots).where(eq(hotspots.id, id));
  await recordAudit({
    actorId: auth.user.id,
    action: 'hotspot.delete',
    entityType: 'hotspot',
    entityId: id,
  });
}
