import { boolean, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { textDirectionEnum } from './enums';

/**
 * Supported content languages.
 *
 * Locales are rows, not an enum, because adding a language must be an INSERT
 * performed by an administrator — never a migration and never a code change.
 * Every `*_translations` table references this table, so a typo'd locale code
 * is rejected by the database.
 */
export const locales = pgTable('locales', {
  /** BCP-47 code, e.g. `ar`, `en`, `fr`, `ar-SY`. */
  code: varchar('code', { length: 10 }).primaryKey(),
  /** Name in English, for the admin UI. */
  name: text('name').notNull(),
  /** Endonym — how speakers write it themselves, for the visitor switcher. */
  nativeName: text('native_name').notNull(),
  direction: textDirectionEnum('direction').notNull().default('ltr'),
  isActive: boolean('is_active').notNull().default(true),
  position: integer('position').notNull().default(0),
});

export type Locale = typeof locales.$inferSelect;

/** Shorthand for the locale foreign key repeated across translation tables. */
export const localeColumn = () =>
  varchar('locale', { length: 10 })
    .notNull()
    .references(() => locales.code, { onDelete: 'cascade', onUpdate: 'cascade' });
