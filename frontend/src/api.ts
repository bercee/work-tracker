import type { CreateWorkdayRequest, ErrorEnvelope, PatchWorkdayRequest, Workday } from '@work-tracker/contracts';

/** Why a request failed: no usable response, HTTP 404, database down, or any other error response. */
export type ApiErrorKind = 'network' | 'not-found' | 'database-unavailable' | 'rejected';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly field?: string,
    readonly kind: ApiErrorKind = 'rejected',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
    if (response.status === 204) return undefined as T;
    const body: unknown = await response.json().catch(() => {
      throw new ApiError('The server returned an invalid response.', undefined, 'network');
    });
    if (!response.ok) {
      const envelope = body as Partial<ErrorEnvelope>;
      const message = envelope.error?.message ?? 'The request could not be completed.';
      const field = envelope.error?.field;
      const kind: ApiErrorKind =
        envelope.error?.code === 'DATABASE_UNAVAILABLE'
          ? 'database-unavailable'
          : response.status === 404
            ? 'not-found'
            : 'rejected';
      throw new ApiError(message, field, kind);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reach the server. Please try again.', undefined, 'network');
  }
}
const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const remove = (path: string) => request<void>(path, { method: 'DELETE' });

export interface HealthStatus {
  status: string;
}

export const checkHealth = () => get<HealthStatus>('/api/health');
export const getWorkdays = () => get<Workday[]>('/api/days');
export const addWorkday = (body: CreateWorkdayRequest) => post<Workday>('/api/days', body);
export const patchWorkday = (date: string, body: PatchWorkdayRequest) => patch<Workday>(`/api/days/${date}`, body);
export const deleteWorkday = (date: string) => remove(`/api/days/${date}`);
