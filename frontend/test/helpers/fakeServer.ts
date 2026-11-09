import {
  createWorkdaySchema,
  dateSchema,
  patchWorkdaySchema,
  workdayFieldsSchema,
  type ErrorCode,
  type Workday,
} from '@work-tracker/contracts';
import { vi } from 'vitest';
import type { z } from 'zod';

export interface RecordedRequest {
  method: string;
  path: string;
  /** Parsed JSON body; undefined when the request had none. */
  body: unknown;
}

export interface FakeServer {
  /** The stored Workdays, newest first, as the API would list them. Returns a copy. */
  workdays(): Workday[];
  /**
   * Makes the next request, whatever it is, fail with this status and error code. Failed requests are still
   * recorded, so tests can assert that a request was or was not sent.
   */
  failNext(status: number, code: ErrorCode): void;
  /** Every request received so far, in order, including failed ones and GETs. */
  requests: RecordedRequest[];
}

const MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'The request was not valid.',
  NOT_FOUND: 'Not found.',
  CONFLICT: 'A Workday already exists for that date.',
  UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json.',
  INTERNAL_ERROR: 'Something went wrong on the server.',
  DATABASE_UNAVAILABLE: 'Database is unavailable',
};

const json = (status: number, body?: unknown): Response =>
  status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status });

const failure = (status: number, code: ErrorCode, message = MESSAGES[code], field?: string): Response =>
  json(status, { error: { code, message, ...(field === undefined ? {} : { field }) } });

// The real API reports the first issue, naming its field; unknown keys have an empty path, so no field.
const invalid = (error: z.ZodError): Response => {
  const issue = error.issues[0]!;
  const field = issue.path[0];
  return failure(400, 'VALIDATION_ERROR', issue.message, typeof field === 'string' ? field : undefined);
};

const newestFirst = (workdays: Map<string, Workday>): Workday[] =>
  [...workdays.values()].toSorted((a, b) => b.date.localeCompare(a.date));

/**
 * Replaces global fetch with an in-memory implementation of the HTTP API. Validation goes through the shared
 * schemas, so a test that sends a request the real backend would reject sees the same status and message, and
 * the UI cannot pass here by relying on rules the server does not enforce. Unlike the real backend this never
 * rejects a request for being malformed JSON or missing a content type: tests go through the api client,
 * which always sends valid JSON.
 *
 * Call it inside a test or beforeEach; setup.ts restores the real fetch after each test.
 */
export function installFakeServer(initial: Workday[]): FakeServer {
  const stored = new Map(initial.map((workday) => [workday.date, { ...workday }]));
  const requests: RecordedRequest[] = [];
  let nextFailure: { status: number; code: ErrorCode } | undefined;

  const handle = (method: string, path: string, body: unknown): Response => {
    if (method === 'GET' && path === '/api/health') return json(200, { status: 'ok' });
    if (method === 'GET' && path === '/api/days') return json(200, newestFirst(stored));
    if (method === 'POST' && path === '/api/days') {
      const parsed = createWorkdaySchema.safeParse(body);
      if (!parsed.success) return invalid(parsed.error);
      if (stored.has(parsed.data.date)) return failure(409, 'CONFLICT', undefined, 'date');
      stored.set(parsed.data.date, parsed.data);
      return json(201, parsed.data);
    }

    const member = /^\/api\/days\/([^/]+)$/.exec(path);
    if (member && (method === 'PATCH' || method === 'DELETE')) {
      const date = member[1]!;
      const parsedDate = dateSchema.safeParse(date);
      if (!parsedDate.success) {
        return failure(400, 'VALIDATION_ERROR', parsedDate.error.issues[0]!.message, 'date');
      }
      const existing = stored.get(date);
      if (!existing) return failure(404, 'NOT_FOUND', undefined, 'date');
      if (method === 'DELETE') {
        stored.delete(date);
        return json(204);
      }
      const patch = patchWorkdaySchema.safeParse(body);
      if (!patch.success) return invalid(patch.error);
      // Rules that span several fields can only be checked on the merged result, as the real backend does.
      const merged = workdayFieldsSchema.safeParse({
        clockIn: existing.clockIn,
        clockOut: existing.clockOut,
        lunchMinutes: existing.lunchMinutes,
        halfDay: existing.halfDay,
        ...patch.data,
      });
      if (!merged.success) return invalid(merged.error);
      const updated = { date, ...merged.data };
      stored.set(date, updated);
      return json(200, updated);
    }

    return failure(404, 'NOT_FOUND');
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      const method = init.method ?? 'GET';
      const path = String(input);
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      requests.push({ method, path, body });

      if (nextFailure) {
        const { status, code } = nextFailure;
        nextFailure = undefined;
        return Promise.resolve(failure(status, code));
      }
      return Promise.resolve(handle(method, path, body));
    }),
  );

  return {
    workdays: () => newestFirst(stored).map((workday) => ({ ...workday })),
    failNext: (status, code) => {
      nextFailure = { status, code };
    },
    requests,
  };
}
