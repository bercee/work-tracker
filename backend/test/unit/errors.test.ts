import { describe, expect, it, vi } from 'vitest';

import { createErrorHandler, HttpError, toErrorEnvelope, toHttpError } from '../../src/errors.js';

describe('HTTP-safe errors', () => {
  it('preserves an existing HTTP-safe error without adding an absent field', () => {
    const error = new HttpError(404, 'NOT_FOUND', 'Missing');

    expect(toHttpError(error)).toBe(error);
    expect(toErrorEnvelope(error)).toEqual({ error: { code: 'NOT_FOUND', message: 'Missing' } });
  });

  it.each([
    [{ status: 413, type: 'entity.too.large' }, 413, 'request body must not exceed 16 KB'],
    [{ status: 400, type: 'entity.parse.failed' }, 400, 'body must contain valid JSON'],
  ])('maps body-parser errors to safe validation errors', (source, status, message) => {
    expect(toHttpError(source)).toMatchObject({ status, code: 'VALIDATION_ERROR', message, field: 'body' });
  });

  it.each([null, 'failure', { status: 413, type: 'different' }, new Error('SQL secret')])(
    'sanitizes unknown errors',
    (source) => {
      expect(toHttpError(source)).toMatchObject({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
      });
    },
  );

  it('logs internal failures and writes the sanitized envelope', () => {
    const logger = { error: vi.fn() };
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const handler = createErrorHandler(logger);
    const source = new Error('private detail');

    handler(source, {} as never, { status, json } as never, vi.fn());

    expect(logger.error).toHaveBeenCalledWith('Unhandled request error', source);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' },
    });
  });

  const refused = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });

  it.each([
    ['a bare socket error', refused()],
    ['a socket error wrapped by Drizzle', new Error('Failed query: select 1', { cause: refused() })],
    ['an AggregateError from a dual-stack connect', new AggregateError([refused()], 'connect failed')],
    ['a code-less dropped connection', new Error('Connection terminated unexpectedly')],
    ['a server-side shutdown', Object.assign(new Error('terminating connection'), { code: '57P01' })],
    ['a connection-exception SQLSTATE', Object.assign(new Error('connection failure'), { code: '08006' })],
  ])('maps %s to DATABASE_UNAVAILABLE', (_label, source) => {
    expect(toHttpError(source)).toMatchObject({
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database is unavailable',
    });
  });

  it('does not treat a query error as an outage', () => {
    const syntaxError = Object.assign(new Error('syntax error'), { code: '42601' });

    expect(toHttpError(new Error('Failed query', { cause: syntaxError }))).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});
