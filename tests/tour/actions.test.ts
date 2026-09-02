import { describe, expect, it } from 'vitest';
import {
  collectReferences,
  getActionDefinition,
  HOTSPOT_ACTIONS,
  HOTSPOT_ACTION_TYPES,
  isHotspotActionType,
  parseActionPayload,
} from '@/lib/tour/actions';
import { hotspotActionEnum } from '@/server/db/schema';

/**
 * The hotspot action registry.
 *
 * The registry is the seam the brief asks for — behaviour as data rather than
 * a growing switch statement — so these tests guard the two things that make
 * it trustworthy: it stays in step with the database enum, and it actually
 * refuses malformed payloads instead of passing them through.
 */

describe('registry integrity', () => {
  it('covers exactly the action types the database allows', () => {
    // If these drift, a hotspot can be stored that nothing knows how to
    // render, or an action can be offered that the column will reject.
    expect([...HOTSPOT_ACTION_TYPES].sort()).toEqual([...hotspotActionEnum.enumValues].sort());
  });

  it('gives every action a schema, an icon, a style and a label', () => {
    for (const type of HOTSPOT_ACTION_TYPES) {
      const definition = getActionDefinition(type);
      expect(definition.type).toBe(type);
      expect(definition.schema).toBeDefined();
      expect(definition.defaultIcon).toBeTruthy();
      expect(definition.defaultStyle).toBeTruthy();
      expect(definition.labelKey).toBeTruthy();
    }
  });

  it('marks only navigation as changing the scene', () => {
    const navigating = HOTSPOT_ACTION_TYPES.filter((type) => HOTSPOT_ACTIONS[type].navigates);
    expect(navigating).toEqual(['navigate']);
  });

  it('recognises its own type names and rejects anything else', () => {
    expect(isHotspotActionType('navigate')).toBe(true);
    expect(isHotspotActionType('nonsense')).toBe(false);
    expect(isHotspotActionType(null)).toBe(false);
    expect(isHotspotActionType(42)).toBe(false);
    // Guards against a prototype-chain false positive.
    expect(isHotspotActionType('toString')).toBe(false);
    expect(isHotspotActionType('constructor')).toBe(false);
  });
});

describe('payload validation', () => {
  const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('accepts a well-formed payload for each action', () => {
    expect(parseActionPayload('navigate', { sceneId: uuid }).ok).toBe(true);
    expect(parseActionPayload('poi', { poiId: uuid }).ok).toBe(true);
    expect(parseActionPayload('info', {}).ok).toBe(true);
    expect(parseActionPayload('gallery', { mediaIds: [uuid] }).ok).toBe(true);
    expect(parseActionPayload('link', { url: 'https://example.org/page' }).ok).toBe(true);
  });

  it('rejects an unknown action type', () => {
    const result = parseActionPayload('exec', { cmd: 'rm -rf /' });
    expect(result.ok).toBe(false);
  });

  it('rejects a payload whose id is not a uuid', () => {
    expect(parseActionPayload('navigate', { sceneId: 'not-a-uuid' }).ok).toBe(false);
    expect(parseActionPayload('navigate', { sceneId: '' }).ok).toBe(false);
    expect(parseActionPayload('navigate', {}).ok).toBe(false);
  });

  it('rejects extra fields rather than silently ignoring them', () => {
    // `.strict()` on every schema: an unexpected key means the form and the
    // registry disagree, and guessing which is right is worse than refusing.
    const result = parseActionPayload('navigate', { sceneId: uuid, andAlso: 'something' });
    expect(result.ok).toBe(false);
  });

  it('rejects a payload for the wrong action', () => {
    expect(parseActionPayload('navigate', { poiId: uuid }).ok).toBe(false);
    expect(parseActionPayload('poi', { sceneId: uuid }).ok).toBe(false);
    expect(parseActionPayload('info', { sceneId: uuid }).ok).toBe(false);
  });

  it('treats a null or missing payload as empty', () => {
    expect(parseActionPayload('info', null).ok).toBe(true);
    expect(parseActionPayload('info', undefined).ok).toBe(true);
  });

  describe('external links', () => {
    it('accepts http and https', () => {
      expect(parseActionPayload('link', { url: 'https://example.org' }).ok).toBe(true);
      expect(parseActionPayload('link', { url: 'http://example.org' }).ok).toBe(true);
    });

    it('rejects javascript:, data: and vbscript: URLs', () => {
      // Without this, an editor-supplied field reaching an anchor's href is
      // stored XSS.
      for (const url of [
        'javascript:alert(document.cookie)',
        'JavaScript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
      ]) {
        expect(parseActionPayload('link', { url }).ok, `should reject ${url}`).toBe(false);
      }
    });

    it('rejects a relative or malformed URL', () => {
      expect(parseActionPayload('link', { url: '/somewhere' }).ok).toBe(false);
      expect(parseActionPayload('link', { url: 'not a url' }).ok).toBe(false);
      expect(parseActionPayload('link', { url: '' }).ok).toBe(false);
    });
  });

  describe('galleries', () => {
    it('requires at least one item and caps the number', () => {
      expect(parseActionPayload('gallery', { mediaIds: [] }).ok).toBe(false);
      expect(
        parseActionPayload('gallery', { mediaIds: Array.from({ length: 61 }, () => uuid) }).ok,
      ).toBe(false);
    });
  });
});

describe('reference collection', () => {
  const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const other = '11111111-2222-3333-4444-555555555555';

  it('reports what each action points at, so the server can scope-check it', () => {
    expect(collectReferences('navigate', { sceneId: uuid })).toEqual([
      { entity: 'scene', ids: [uuid] },
    ]);
    expect(collectReferences('poi', { poiId: uuid })).toEqual([{ entity: 'poi', ids: [uuid] }]);
    expect(collectReferences('event', { eventId: uuid })).toEqual([
      { entity: 'event', ids: [uuid] },
    ]);
  });

  it('collects every id from a multi-valued payload', () => {
    expect(collectReferences('gallery', { mediaIds: [uuid, other] })).toEqual([
      { entity: 'media', ids: [uuid, other] },
    ]);
  });

  it('reports nothing for actions that reference nothing', () => {
    expect(collectReferences('info', {})).toEqual([]);
    expect(collectReferences('link', { url: 'https://example.org' })).toEqual([]);
  });

  it('ignores non-string values instead of passing them to a query', () => {
    expect(collectReferences('gallery', { mediaIds: [uuid, 42, null, {}] })).toEqual([
      { entity: 'media', ids: [uuid] },
    ]);
    expect(collectReferences('navigate', { sceneId: 12345 })).toEqual([
      { entity: 'scene', ids: [] },
    ]);
  });
});
