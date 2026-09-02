import { z } from 'zod';

/**
 * Boot-time environment validation.
 *
 * The process must refuse to start rather than run in a half-configured state.
 * In production the rules are stricter: placeholder secrets, short secrets and
 * insecure origins are all fatal, so a deployment cannot silently inherit the
 * example values from `.env.example`.
 */

const PLACEHOLDER_PATTERN = /^(replace-me|changeme|change-me|secret|password|test|example)/i;

const isProduction = process.env.NODE_ENV === 'production';

/** A secret that is long enough and is not a copy of the example file. */
const strongSecret = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .superRefine((value, ctx) => {
      if (!isProduction) return;
      if (value.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be at least 32 characters in production`,
        });
      }
      if (PLACEHOLDER_PATTERN.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} still holds a placeholder value from .env.example`,
        });
      }
    });

const booleanish = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    APP_ORIGIN: z
      .string()
      .url('APP_ORIGIN must be an absolute URL, e.g. https://example.org')
      .default('http://localhost:3000')
      .superRefine((value, ctx) => {
        if (isProduction && !value.startsWith('https://')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'APP_ORIGIN must use https in production — cookies are Secure-only',
          });
        }
      }),

    DATABASE_DRIVER: z.enum(['postgres', 'pglite']).default('pglite'),
    DATABASE_URL: z.string().optional(),
    PGLITE_DATA_DIR: z.string().default('./.pgdata'),

    SESSION_SECRET: strongSecret('SESSION_SECRET'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('./storage'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().url().optional(),

    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800),
    MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(80_000_000),

    ANALYTICS_ENABLED: booleanish(true),
    ANALYTICS_SALT: strongSecret('ANALYTICS_SALT'),

    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.DATABASE_DRIVER === 'postgres' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when DATABASE_DRIVER=postgres',
      });
    }
    if (isProduction && env.DATABASE_DRIVER === 'pglite') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_DRIVER'],
        message: 'pglite is a development and test driver; production requires postgres',
      });
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3`,
          });
        }
      }
    }
    if (isProduction && env.STORAGE_DRIVER === 'local') {
      // Not fatal — a single-node deployment with a persistent volume is a
      // legitimate configuration — but it must be a conscious choice.
      console.warn(
        '[config] STORAGE_DRIVER=local in production: media lives on the instance ' +
          'filesystem and will not survive a rebuild unless a volume is mounted.',
      );
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Tests get working defaults so no .env file is needed to run the suite.
  const raw =
    process.env.NODE_ENV === 'test'
      ? {
          ...process.env,
          SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-session-secret-not-used-in-prod',
          ANALYTICS_SALT: process.env.ANALYTICS_SALT ?? 'test-analytics-salt',
        }
      : process.env;

  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n`);
  }

  return parsed.data;
}

let cached: Env | undefined;

/**
 * Validated environment. Lazily parsed and memoised so importing this module
 * from a client-adjacent file does not blow up at build time — only actual use
 * on the server triggers validation.
 */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test-only: forget the memoised value after mutating `process.env`. */
export function resetEnvCache(): void {
  cached = undefined;
}
