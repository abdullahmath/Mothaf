import 'server-only';

import { and, eq, ne, sql, type SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { getDb } from '../../db';
import { auditLog } from '../../db/schema';
import { hashIdentifier } from '../../auth/crypto';
import { getClientIp } from '../../auth/cookies';
import { conflict, validation } from '../errors';

/**
 * Helpers shared by every admin service.
 *
 * Destinations, tours, scenes, POIs and events all have the same shape — a row
 * with a slug, a status and an ordering, plus a sibling translations table — so
 * the mechanics live here once rather than being retyped five times. What is
 * deliberately *not* abstracted is authorization: each service calls
 * `requirePermission` itself, in plain sight, because a generic CRUD factory
 * that hides the permission check is exactly how one entity ends up
 * unprotected.
 */

/* -------------------------------------------------------------------------- */
/*  Validation primitives                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A URL segment.
 *
 * Lower-case, hyphen-separated, no leading or trailing hyphen. Constrained
 * this tightly because a slug ends up in a path, and anything that could be
 * read as a traversal, a scheme, or a query string has no business here.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'A slug is required')
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lower-case letters, numbers and single hyphens, e.g. roman-theatre-jableh',
  );

export const uuidSchema = z.string().uuid();

export const statusSchema = z.enum(['draft', 'published', 'archived']);

export const localeCodeSchema = z.string().trim().min(2).max(10);

/** Trims, and turns an empty string into null so blanks are absent, not "". */
export const optionalText = (max = 20_000) =>
  z
    .string()
    .max(max)
    .transform((value) => {
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const requiredText = (max = 500) => z.string().trim().min(1, 'Required').max(max);

/** Best-effort slug suggestion. The editor can always override it. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Arabic has no case and no ASCII transliteration we could apply
    // faithfully, so non-Latin input collapses to hyphens and the editor is
    // expected to supply a Latin slug. Guessing a transliteration would
    // produce URLs no reader recognises.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/* -------------------------------------------------------------------------- */
/*  Uniqueness                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Checks a slug is free before writing.
 *
 * The database has the unique index and is the real guarantee; this exists to
 * turn a constraint violation into a message attached to the right form field
 * instead of a 500.
 */
export async function assertSlugAvailable(options: {
  table: PgTable;
  slugColumn: PgColumn;
  idColumn: PgColumn;
  slug: string;
  /** Restricts the check to a parent, for slugs unique per destination/tour. */
  scope?: SQL;
  /** The row being updated, so it does not collide with itself. */
  excludeId?: string;
}): Promise<void> {
  const db = await getDb();
  const filters: SQL[] = [eq(options.slugColumn, options.slug)];
  if (options.scope) filters.push(options.scope);
  if (options.excludeId) filters.push(ne(options.idColumn, options.excludeId));

  const [existing] = await db
    .select({ id: options.idColumn })
    .from(options.table)
    .where(and(...filters))
    .limit(1);

  if (existing) {
    throw conflict(`The slug "${options.slug}" is already in use here.`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Translations                                                              */
/* -------------------------------------------------------------------------- */

export type TranslationInput = Record<string, string | null> & { locale: string };

/**
 * Replaces the translation rows for one entity.
 *
 * Delete-then-insert inside a transaction, rather than a per-field diff:
 * removing a language must actually remove it, and an upsert would leave the
 * old row behind. The transaction is what stops a failure halfway through from
 * leaving an entity with no translations at all.
 */
export async function replaceTranslations(options: {
  table: PgTable;
  parentColumn: PgColumn;
  parentId: string;
  rows: TranslationInput[];
}): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(options.table).where(eq(options.parentColumn, options.parentId));
    const values = options.rows
      .filter((row) => Object.entries(row).some(([key, value]) => key !== 'locale' && value))
      .map((row) => ({ ...row, [options.parentColumn.name]: options.parentId }));
    if (values.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.insert(options.table).values(values as any);
    }
  });
}

/**
 * Parses the flat `field.locale` keys a translation form submits into one
 * object per locale.
 *
 * Forms cannot post nested structures, so the field names carry the locale:
 * `title.ar`, `title.en`, `summary.ar`. Anything not matching that shape, or
 * naming a field the caller did not declare, is dropped — a form post is
 * untrusted input like any other.
 */
export function parseTranslationFields(
  formData: FormData,
  fields: readonly string[],
  locales: readonly string[],
): TranslationInput[] {
  return locales.map((locale) => {
    const row: TranslationInput = { locale };
    for (const field of fields) {
      const raw = formData.get(`${field}.${locale}`);
      const value = typeof raw === 'string' ? raw.trim() : '';
      row[field] = value.length > 0 ? value : null;
    }
    return row;
  });
}

/* -------------------------------------------------------------------------- */
/*  Ordering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Applies a new display order.
 *
 * The whole list is renumbered in one transaction so a partial write cannot
 * leave two items claiming the same position.
 */
export async function applyOrder(options: {
  table: PgTable;
  idColumn: PgColumn;
  positionColumn: PgColumn;
  orderedIds: string[];
}): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const [index, id] of options.orderedIds.entries()) {
      await tx
        .update(options.table)
        .set({ [options.positionColumn.name]: index })
        .where(eq(options.idColumn, id));
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Audit                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Records a privileged action.
 *
 * Append-only, and never allowed to fail the operation it describes: an audit
 * write that throws would roll back a legitimate edit, which is a worse
 * outcome than a gap in the log.
 */
export async function recordAudit(options: {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    const ip = await getClientIp().catch(() => null);
    await db.insert(auditLog).values({
      actorId: options.actorId,
      action: options.action,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      ipHash: ip ? hashIdentifier(ip) : null,
      metadata: options.metadata ?? {},
    });
  } catch (error) {
    console.error('[audit] failed to record action', options.action, error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Form results                                                              */
/* -------------------------------------------------------------------------- */

/** What every Server Action returns, so forms can render errors uniformly. */
export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; message: string; fields?: Record<string, string> };

/** Turns a Zod failure into field-scoped messages for the form. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

export function fail(message: string, fields?: Record<string, string>): ActionResult {
  return { ok: false, message, ...(fields ? { fields } : {}) };
}

export { validation, sql };
