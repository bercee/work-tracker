import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, addWorkday, checkHealth, deleteWorkday, getWorkdays, patchWorkday } from '../../src/api';

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists Workdays with a GET and JSON accept header', async () => {
    const fetchMock = stubFetch(new Response('[]', { status: 200 }));
    await expect(getWorkdays()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/days',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('adds a Workday with a JSON POST body', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 201 }));
    await addWorkday({ date: '2026-11-11', clockIn: '08:00' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/days',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ date: '2026-11-11', clockIn: '08:00' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('patches a Workday by date with a JSON PATCH body', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    await patchWorkday('2026-11-11', { lunchMinutes: null });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/days/2026-11-11',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ lunchMinutes: null }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('deletes a Workday and accepts the empty 204 response', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await expect(deleteWorkday('2026-11-11')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/days/2026-11-11', expect.objectContaining({ method: 'DELETE' }));
  });

  it('classifies failures as network, not found or rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getWorkdays()).rejects.toEqual(
      new ApiError('Unable to reach the server. Please try again.', undefined, 'network'),
    );

    stubFetch(new Response('not JSON', { status: 200 }));
    await expect(getWorkdays()).rejects.toEqual(
      new ApiError('The server returned an invalid response.', undefined, 'network'),
    );

    const envelope = JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Gone', field: 'date' } });
    stubFetch(new Response(envelope, { status: 404 }));
    await expect(patchWorkday('2026-11-11', {})).rejects.toMatchObject({
      kind: 'not-found',
      message: 'Gone',
      field: 'date',
    });

    for (const status of [400, 409]) {
      stubFetch(new Response(envelope, { status }));
      await expect(getWorkdays()).rejects.toMatchObject({ kind: 'rejected', message: 'Gone', field: 'date' });
    }
  });

  it('uses a safe message when the error envelope is incomplete', async () => {
    stubFetch(new Response(JSON.stringify({ error: {} }), { status: 400 }));
    await expect(getWorkdays()).rejects.toEqual(
      new ApiError('The request could not be completed.', undefined, 'rejected'),
    );
  });

  it('classifies a DATABASE_UNAVAILABLE response, including the health body', async () => {
    const error = { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ status: 'unavailable', error }), { status: 503 })),
        ),
    );
    await expect(checkHealth()).rejects.toMatchObject({
      message: 'Database is unavailable',
      kind: 'database-unavailable',
    });
    await expect(getWorkdays()).rejects.toMatchObject({ kind: 'database-unavailable' });
  });
});
