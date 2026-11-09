import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Workday } from '@work-tracker/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { installFakeServer } from '../helpers/fakeServer';

const workday = (
  date: string,
  clockIn: string,
  clockOut: string | null,
  lunchMinutes: number | null,
  halfDay = false,
): Workday => ({
  date,
  clockIn,
  clockOut,
  lunchMinutes,
  halfDay,
});

// The worked example for Wednesday 2026-11-11: this week +1:00, overall -4:30.
const workedExample = [
  workday('2026-11-04', '08:00', '17:00', null),
  workday('2026-11-05', '08:00', null, 60),
  workday('2026-11-06', '08:00', '17:30', 60),
  workday('2026-11-08', '10:00', '12:00', 0),
  workday('2026-11-09', '08:00', '17:00', 60),
  workday('2026-11-10', '08:00', '13:00', 0, true),
  workday('2026-11-11', '08:00', null, null),
  workday('2026-11-12', '08:00', '17:00', 60),
];

const balance = () => within(screen.getByRole('region', { name: 'Balance' }));
const figure = (label: string) => balance().getByText(label).parentElement;

describe('<App />', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T10:30:00'));
  });

  it('shows the current-week and overall Balance', async () => {
    installFakeServer(workedExample);
    render(<App />);

    await screen.findByRole('region', { name: 'Balance' });
    expect(figure('This week')).toHaveTextContent('+1:00');
    expect(figure('Overall')).toHaveTextContent('-4:30');
  });

  it('shows every region once the Workdays have loaded', async () => {
    installFakeServer(workedExample);
    render(<App />);

    await screen.findByRole('region', { name: 'Balance' });
    for (const name of ['Warnings', 'Today', 'Balance over time', 'Workdays']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('shows a load error and loads the Workdays when Retry is pressed', async () => {
    const server = installFakeServer(workedExample);
    server.failNext(500, 'INTERNAL_ERROR');
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server.');
    expect(screen.queryByRole('region', { name: 'Balance' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByRole('region', { name: 'Balance' });
    expect(figure('Overall')).toHaveTextContent('-4:30');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the database is unavailable when the server reports that', async () => {
    const server = installFakeServer(workedExample);
    server.failNext(503, 'DATABASE_UNAVAILABLE');
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('moves to the next day when the clock passes midnight', async () => {
    // setInterval is faked as well here, so the test can advance the 30-second clock refresh by hand.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-11T23:59:40'));
    // Thursday's Workday is 30 minutes over, so it moves the Balance only once Thursday is today.
    installFakeServer([...workedExample.slice(0, -1), workday('2026-11-12', '08:00', '17:30', 60)]);
    render(<App />);
    await screen.findByRole('region', { name: 'Balance' });
    expect(figure('This week')).toHaveTextContent('+1:00');
    expect(figure('Overall')).toHaveTextContent('-4:30');

    vi.setSystemTime(new Date('2026-11-12T00:00:10'));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(figure('This week')).toHaveTextContent('+1:30');
    expect(figure('Overall')).toHaveTextContent('-4:00');
  });
});

describe('fake server', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  const send = (method: string, path: string, body?: unknown) =>
    fetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  it('rejects a duplicate date with 409 and a missing date with 404', async () => {
    const server = installFakeServer([workday('2026-11-09', '08:00', null, null)]);

    const duplicate = await send('POST', '/api/days', { date: '2026-11-09', clockIn: '09:00' });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: { code: 'CONFLICT', field: 'date' } });
    expect(server.workdays()[0]?.clockIn).toBe('08:00');

    expect((await send('PATCH', '/api/days/2026-11-10', {})).status).toBe(404);
    expect((await send('DELETE', '/api/days/2026-11-10')).status).toBe(404);
  });

  it('validates a patch against the stored values', async () => {
    const server = installFakeServer([workday('2026-11-09', '08:00', '17:00', 60)]);

    const response = await send('PATCH', '/api/days/2026-11-09', { lunchMinutes: 600 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR', field: 'lunchMinutes' } });
    expect(server.workdays()[0]?.lunchMinutes).toBe(60);
  });

  it('applies creates, patches and deletes, listing newest first and recording requests', async () => {
    const server = installFakeServer([workday('2026-11-09', '08:00', null, null)]);

    expect((await send('POST', '/api/days', { date: '2026-11-10', clockIn: '08:30' })).status).toBe(201);
    expect((await send('PATCH', '/api/days/2026-11-10', { clockOut: '17:00', lunchMinutes: null })).status).toBe(200);
    expect((await send('DELETE', '/api/days/2026-11-09')).status).toBe(204);

    expect(server.workdays()).toEqual([workday('2026-11-10', '08:30', '17:00', null)]);
    expect(server.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /api/days',
      'PATCH /api/days/2026-11-10',
      'DELETE /api/days/2026-11-09',
    ]);
    expect(server.requests[1]?.body).toEqual({ clockOut: '17:00', lunchMinutes: null });
  });

  it('fails only the next request, and still records it', async () => {
    const server = installFakeServer([]);
    server.failNext(503, 'DATABASE_UNAVAILABLE');

    expect((await send('GET', '/api/days')).status).toBe(503);
    expect((await send('GET', '/api/days')).status).toBe(200);
    expect(server.requests).toHaveLength(2);
  });

  it('answers unknown API paths with a JSON 404', async () => {
    installFakeServer([]);
    const response = await send('GET', '/api/nothing');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('answers the health probe', async () => {
    installFakeServer([]);
    expect(await (await send('GET', '/api/health')).json()).toEqual({ status: 'ok' });
  });
});
