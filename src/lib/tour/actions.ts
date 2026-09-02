import { z } from 'zod';
import type { MessageKey } from '../i18n';
import type { HotspotActionType } from './types';

/**
 * The hotspot action registry.
 *
 * A hotspot's behaviour is data (`action_type` + `action_payload`), not code.
 * Everything that needs to reason about an action — payload validation on
 * write, referential integrity checks, the admin's form fields, the viewer's
 * dispatch, the default icon and label — reads it from this one table.
 *
 * Adding an action is: extend the `hotspot_action` enum, add an entry here,
 * add a handler in `useHotspotActions`. TypeScript then reports every place
 * that still needs attention, because both maps are typed
 * `Record<HotspotActionType, …>` and must be exhaustive.
 */

const uuid = z.string().uuid();

/**
 * External links are restricted to http(s).
 *
 * This rejects `javascript:`, `data:` and `vbscript:` URLs, which would
 * otherwise turn an editor-supplied field into stored XSS the moment it
 * reached an anchor's href.
 */
const externalUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be an absolute URL' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only http and https links are allowed',
      });
    }
  });

/** Which entity a payload points at, so the server can verify it exists. */
export type ActionReference =
  | { field: string; entity: 'scene' | 'poi' | 'media' | 'event'; many?: false }
  | { field: string; entity: 'media'; many: true };

export type ActionDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  type: HotspotActionType;
  schema: S;
  /** Default marker icon when the editor has not chosen one. */
  defaultIcon: string;
  /** Default visual treatment. */
  defaultStyle: 'pin' | 'pulse' | 'label' | 'arrow';
  /** Accessible action label shown to visitors, e.g. "Play narration". */
  labelKey: MessageKey;
  /**
   * References the server must resolve before saving, so a hotspot can never
   * point at a deleted scene or at content in another destination.
   */
  references: ActionReference[];
  /** Whether following this action changes which scene the visitor is in. */
  navigates: boolean;
};

const definitions = {
  /** Move to another scene in the same tour. */
  navigate: {
    type: 'navigate',
    schema: z.object({ sceneId: uuid }).strict(),
    defaultIcon: 'arrow',
    defaultStyle: 'arrow',
    labelKey: 'hotspot.navigate',
    references: [{ field: 'sceneId', entity: 'scene' }],
    navigates: true,
  },

  /** Open the detail panel for a point of interest. */
  poi: {
    type: 'poi',
    schema: z.object({ poiId: uuid }).strict(),
    defaultIcon: 'marker',
    defaultStyle: 'pin',
    labelKey: 'hotspot.openPoi',
    references: [{ field: 'poiId', entity: 'poi' }],
    navigates: false,
  },

  /** Show the hotspot's own label and description. No external reference. */
  info: {
    type: 'info',
    schema: z.object({}).strict(),
    defaultIcon: 'info',
    defaultStyle: 'pulse',
    labelKey: 'hotspot.openInfo',
    references: [],
    navigates: false,
  },

  /** Show one image full-bleed. */
  image: {
    type: 'image',
    schema: z.object({ mediaId: uuid }).strict(),
    defaultIcon: 'image',
    defaultStyle: 'pin',
    labelKey: 'hotspot.openGallery',
    references: [{ field: 'mediaId', entity: 'media' }],
    navigates: false,
  },

  /** Open a lightbox over an ordered set of images. */
  gallery: {
    type: 'gallery',
    schema: z.object({ mediaIds: z.array(uuid).min(1).max(60) }).strict(),
    defaultIcon: 'gallery',
    defaultStyle: 'pin',
    labelKey: 'hotspot.openGallery',
    references: [{ field: 'mediaIds', entity: 'media', many: true }],
    navigates: false,
  },

  video: {
    type: 'video',
    schema: z.object({ mediaId: uuid, autoplay: z.boolean().default(false) }).strict(),
    defaultIcon: 'play',
    defaultStyle: 'pin',
    labelKey: 'hotspot.playVideo',
    references: [{ field: 'mediaId', entity: 'media' }],
    navigates: false,
  },

  audio: {
    type: 'audio',
    schema: z.object({ mediaId: uuid }).strict(),
    defaultIcon: 'audio',
    defaultStyle: 'pulse',
    labelKey: 'hotspot.playAudio',
    references: [{ field: 'mediaId', entity: 'media' }],
    navigates: false,
  },

  event: {
    type: 'event',
    schema: z.object({ eventId: uuid }).strict(),
    defaultIcon: 'calendar',
    defaultStyle: 'pin',
    labelKey: 'hotspot.openEvent',
    references: [{ field: 'eventId', entity: 'event' }],
    navigates: false,
  },

  link: {
    type: 'link',
    schema: z.object({ url: externalUrl }).strict(),
    defaultIcon: 'external',
    defaultStyle: 'pin',
    labelKey: 'hotspot.openLink',
    references: [],
    navigates: false,
  },
} as const satisfies Record<HotspotActionType, ActionDefinition>;

export const HOTSPOT_ACTIONS: Record<HotspotActionType, ActionDefinition> = definitions;

export const HOTSPOT_ACTION_TYPES = Object.keys(definitions) as HotspotActionType[];

export function getActionDefinition(type: HotspotActionType): ActionDefinition {
  return HOTSPOT_ACTIONS[type];
}

export type ParsedAction =
  | { ok: true; type: HotspotActionType; payload: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validates a payload against the schema registered for its action type.
 *
 * Used on write (rejecting malformed admin input) and on read (so a payload
 * that predates a schema change cannot reach the browser as an unchecked
 * blob). A hotspot whose payload fails here is dropped from the manifest
 * rather than crashing the tour.
 */
export function parseActionPayload(type: string, payload: unknown): ParsedAction {
  if (!isHotspotActionType(type)) {
    return { ok: false, error: `Unknown hotspot action: ${type}` };
  }
  const result = HOTSPOT_ACTIONS[type].schema.safeParse(payload ?? {});
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return { ok: true, type, payload: result.data as Record<string, unknown> };
}

export function isHotspotActionType(value: unknown): value is HotspotActionType {
  return typeof value === 'string' && value in HOTSPOT_ACTIONS;
}

/** Extracts the ids a payload references, for existence and scope checks. */
export function collectReferences(
  type: HotspotActionType,
  payload: Record<string, unknown>,
): { entity: ActionReference['entity']; ids: string[] }[] {
  return HOTSPOT_ACTIONS[type].references.map((reference) => {
    const raw = payload[reference.field];
    const ids = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === 'string')
      : typeof raw === 'string'
        ? [raw]
        : [];
    return { entity: reference.entity, ids };
  });
}
