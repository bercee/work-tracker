import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorCode, ErrorEnvelope } from '@work-tracker/contracts';

export type { ErrorCode, ErrorEnvelope } from '@work-tracker/contracts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly field: string | undefined;

  constructor(status: number, code: ErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

// Socket errors, plus the SQLSTATEs Postgres sends while refusing or ending connections (08xxx is matched by prefix).
const connectionFailureCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

// Drizzle puts the driver error on `cause`; Node reports dual-stack connect failures as an AggregateError.
// pg's "Connection terminated" errors carry no code, so they are matched by message.
function isDatabaseUnavailableError(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error) || depth > 5) {
    return false;
  }

  const code: unknown = Reflect.get(error, 'code');
  if (typeof code === 'string' && (connectionFailureCodes.has(code) || code.startsWith('08'))) {
    return true;
  }

  if (error.message.startsWith('Connection terminated')) {
    return true;
  }

  const nested: unknown[] = error instanceof AggregateError ? error.errors : [];
  return [error.cause, ...nested].some((inner) => isDatabaseUnavailableError(inner, depth + 1));
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (isDatabaseUnavailableError(error)) {
    return new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable');
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0]!;
    return new HttpError(400, 'VALIDATION_ERROR', issue.message, issue.path.join('.') || 'body');
  }

  if (isBodyParserError(error, 413, 'entity.too.large')) {
    return new HttpError(413, 'VALIDATION_ERROR', 'request body must not exceed 16 KB', 'body');
  }

  if (isBodyParserError(error, 400, 'entity.parse.failed')) {
    return new HttpError(400, 'VALIDATION_ERROR', 'body must contain valid JSON', 'body');
  }

  return new HttpError(500, 'INTERNAL_ERROR', 'An internal error occurred');
}

export function toErrorEnvelope(error: HttpError): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.field === undefined ? {} : { field: error.field }),
    },
  };
}

export function createErrorHandler(logger: Pick<Console, 'error'> = console): ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    void request;
    void next;
    const httpError = toHttpError(error);

    if (httpError.status >= 500) {
      logger.error('Unhandled request error', error);
    }

    response.status(httpError.status).json(toErrorEnvelope(httpError));
  };
}

function isBodyParserError(error: unknown, status: number, type: string): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  return Reflect.get(error, 'status') === status && Reflect.get(error, 'type') === type;
}
