/**
 * Domain errors.
 *
 * The domain layer never throws a bare `Error` and never returns an HTTP
 * status. It raises one of these; the HTTP layer maps them to a status and a
 * safe message. That keeps transport concerns out of business logic and, more
 * importantly, means an internal message cannot leak to a client by accident —
 * only `publicMessage` is ever serialised.
 */

export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'unsupported_media'
  | 'payload_too_large'
  | 'internal';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  unsupported_media: 415,
  payload_too_large: 413,
  internal: 500,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Field-scoped messages, safe to show. */
  readonly fields: Record<string, string> | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: { fields?: Record<string, string>; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'DomainError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export const unauthenticated = (message = 'Authentication required') =>
  new DomainError('unauthenticated', message);

export const forbidden = (message = 'Not permitted') => new DomainError('forbidden', message);

/**
 * Used for genuinely absent records *and* for records the caller may not see.
 *
 * Answering "forbidden" for content that exists but is not theirs confirms its
 * existence, which is an information leak. Both cases return 404.
 */
export const notFound = (message = 'Not found') => new DomainError('not_found', message);

export const validation = (message: string, fields?: Record<string, string>) =>
  new DomainError('validation', message, { fields });

export const conflict = (message: string) => new DomainError('conflict', message);

export const rateLimited = (retryAfterSeconds: number) =>
  new DomainError('rate_limited', 'Too many requests', { retryAfterSeconds });

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Shape returned to clients. Internal messages for 5xx are replaced with a
 * generic string; everything else is already written to be shown.
 */
export function toPublicError(error: unknown): {
  status: number;
  body: { error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
  retryAfterSeconds?: number;
} {
  if (isDomainError(error)) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.status >= 500 ? 'Internal error' : error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    };
  }

  return {
    status: 500,
    body: { error: { code: 'internal', message: 'Internal error' } },
  };
}
