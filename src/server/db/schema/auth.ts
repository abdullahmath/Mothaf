import { sql } from 'drizzle-orm';
import {
  bigserial,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { userRoleEnum, userStatusEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Stored lower-cased and trimmed. The unique index below is built on the
     * raw column because normalization happens in one place
     * (`normalizeEmail`) before every read and write, which keeps the index
     * usable for lookups without needing the citext extension.
     */
    email: text('email').notNull(),
    /** Argon2id encoded hash. Never a plaintext or reversible value. */
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: userRoleEnum('role').notNull().default('content_editor'),
    status: userStatusEnum('status').notNull().default('active'),
    /** Preferred admin UI language; falls back to the request locale. */
    preferredLocale: varchar('preferred_locale', { length: 10 }),

    // --- Brute-force resistance -------------------------------------------
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    /**
     * Bumped on password change and on "sign out everywhere". Sessions issued
     * before this instant are rejected even if unexpired.
     */
    sessionsValidFrom: timestamp('sessions_valid_from', { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * SHA-256 of the opaque session token. The token itself exists only in the
     * user's cookie, so a database disclosure yields no usable sessions.
     */
    tokenHash: text('token_hash').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Advanced on use; drives the idle timeout. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Hard ceiling — never extended, regardless of activity. */
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    /** Salted hash only. Raw client IPs are never persisted. */
    ipHash: text('ip_hash'),
    /** Truncated and coarsened for the "your sessions" screen. */
    userAgentLabel: text('user_agent_label'),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_absolute_expires_at_idx').on(t.absoluteExpiresAt),
  ],
);

/**
 * Password reset tokens. Single-use, short-lived, and stored hashed for the
 * same reason session tokens are.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('password_reset_tokens_token_hash_key').on(t.tokenHash),
    index('password_reset_tokens_user_id_idx').on(t.userId),
  ],
);

/**
 * Token-bucket rate limiting, kept in the database so limits hold across
 * multiple application instances. Used for authentication and uploads; the
 * high-volume analytics endpoint uses an in-process limiter instead because a
 * write per beacon would be a poor trade.
 */
export const rateLimits = pgTable('rate_limits', {
  /** e.g. `login:ip:<hash>` or `login:user:<uuid>`. */
  key: text('key').primaryKey(),
  /** Fractional, because refill is a rate per second rather than per request. */
  tokens: doublePrecision('tokens').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only record of privileged actions. Written by the domain layer, never
 * updated or deleted by the application.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Null when the actor could not be established (e.g. failed login). */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    ipHash: text('ip_hash'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_actor_id_idx').on(t.actorId),
    index('audit_log_occurred_at_idx').on(t.occurredAt),
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
