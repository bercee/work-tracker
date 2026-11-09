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
): Workday => ({ date, clockIn, clockOut, lunchMinutes, halfDay });

const today = () => within(screen.getByRole('region', { name: 'Today' }));
const lunchInput = () => today().getByLabelText('Lunch break (minutes)');

const renderApp = async (workdays: Workday[]) => {
  const server = installFakeServer(workdays);
  render(<App />);
  await screen.findByRole('region', { name: 'Today' });
  return server;
};

// Requests the user caused, without the initial and refresh GETs.
const writes = (server: ReturnType<typeof installFakeServer>) =>
  server.requests.filter(({ method }) => method !== 'GET');

describe('Today card', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T10:30:00'));
  });

  describe('without a Workday today', () => {
    it('offers Clock in and shows no clocked-in details', async () => {
      await renderApp([workday('2026-11-10', '08:00', '17:00', 60)]);

      expect(today().getByRole('button', { name: 'Clock in' })).toBeInTheDocument();
      expect(today().queryByLabelText('Lunch break (minutes)')).not.toBeInTheDocument();
      expect(today().queryByRole('button', { name: 'Clock out' })).not.toBeInTheDocument();
    });

    it('sends the browser date and time as the Clock-in, then shows the clocked-in state', async () => {
      const server = await renderApp([]);

      await userEvent.click(today().getByRole('button', { name: 'Clock in' }));

      expect(writes(server)).toEqual([
        { method: 'POST', path: '/api/days', body: { date: '2026-11-11', clockIn: '10:30' } },
      ]);
      expect(await today().findByRole('button', { name: 'Clock out' })).toBeInTheDocument();
      expect(today().getByText('10:30')).toBeInTheDocument();
    });

    it('shows an error when a Workday already exists for the date', async () => {
      const server = await renderApp([]);
      server.failNext(409, 'CONFLICT');

      await userEvent.click(today().getByRole('button', { name: 'Clock in' }));

      expect(await today().findByRole('alert')).toHaveTextContent('A Workday already exists for that date.');
    });
  });

  describe('clocked in', () => {
    const clockedIn = (lunch: number | null = null, halfDay = false) =>
      workday('2026-11-11', '08:00', null, lunch, halfDay);

    it('shows the Clock-in, the time worked so far, and the Lunch break pre-filled as not saved', async () => {
      await renderApp([clockedIn()]);

      expect(today().getByText('08:00')).toBeInTheDocument();
      expect(today().getByText('2:30')).toBeInTheDocument();
      expect(lunchInput()).toHaveValue('60');
      expect(today().getByText('Not saved yet')).toBeInTheDocument();
      expect(today().getByRole('checkbox', { name: 'Half day' })).not.toBeChecked();
    });

    it('shows a saved Lunch break without the hint, and takes it off the time so far', async () => {
      await renderApp([clockedIn(45)]);

      expect(lunchInput()).toHaveValue('45');
      expect(today().queryByText('Not saved yet')).not.toBeInTheDocument();
      expect(today().getByText('1:45')).toBeInTheDocument();
    });

    it('does not send the pre-filled Lunch break until it is confirmed', async () => {
      const server = await renderApp([clockedIn()]);

      expect(lunchInput()).toHaveValue('60');
      expect(writes(server)).toEqual([]);
      expect(server.workdays()[0]?.lunchMinutes).toBeNull();
    });

    it('saves the Lunch break with Save lunch', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.clear(lunchInput());
      await userEvent.type(lunchInput(), '30');
      await userEvent.click(today().getByRole('button', { name: 'Save lunch' }));

      expect(writes(server)).toEqual([{ method: 'PATCH', path: '/api/days/2026-11-11', body: { lunchMinutes: 30 } }]);
      await vi.waitFor(() => expect(today().queryByText('Not saved yet')).not.toBeInTheDocument());
      expect(lunchInput()).toHaveValue('30');
    });

    it('confirms the pre-filled Lunch break when it is saved untouched', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.click(today().getByRole('button', { name: 'Save lunch' }));

      expect(writes(server)[0]?.body).toEqual({ lunchMinutes: 60 });
    });

    it('clocks out in one request carrying the Clock-out and the pre-filled Lunch break', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.click(today().getByRole('button', { name: 'Clock out' }));

      expect(writes(server)).toEqual([
        { method: 'PATCH', path: '/api/days/2026-11-11', body: { clockOut: '10:30', lunchMinutes: 60 } },
      ]);
      expect(server.workdays()[0]).toEqual(workday('2026-11-11', '08:00', '10:30', 60));
    });

    it('uses a typed Lunch break instead of the pre-fill when clocking out', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.clear(lunchInput());
      await userEvent.type(lunchInput(), '15');
      await userEvent.click(today().getByRole('button', { name: 'Clock out' }));

      expect(writes(server)[0]?.body).toEqual({ clockOut: '10:30', lunchMinutes: 15 });
    });

    it('leaves the Lunch break empty when the input is cleared before clocking out', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.clear(lunchInput());
      await userEvent.click(today().getByRole('button', { name: 'Clock out' }));

      expect(writes(server)[0]?.body).toEqual({ clockOut: '10:30', lunchMinutes: null });
    });

    it('switches the pre-fill to 0 on a Half day and saves the Half day immediately', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.click(today().getByRole('checkbox', { name: 'Half day' }));

      expect(writes(server)).toEqual([{ method: 'PATCH', path: '/api/days/2026-11-11', body: { halfDay: true } }]);
      await vi.waitFor(() => expect(lunchInput()).toHaveValue('0'));
      expect(today().getByRole('checkbox', { name: 'Half day' })).toBeChecked();
      expect(server.workdays()[0]?.lunchMinutes).toBeNull();
    });

    it('keeps a typed Lunch break when the Half day is toggled', async () => {
      await renderApp([clockedIn()]);

      await userEvent.clear(lunchInput());
      await userEvent.type(lunchInput(), '20');
      await userEvent.click(today().getByRole('checkbox', { name: 'Half day' }));

      await vi.waitFor(() => expect(today().getByRole('checkbox', { name: 'Half day' })).toBeChecked());
      expect(lunchInput()).toHaveValue('20');
    });

    it('rejects a Lunch break that is not a whole number without sending anything', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.clear(lunchInput());
      await userEvent.type(lunchInput(), 'abc');
      await userEvent.click(today().getByRole('button', { name: 'Clock out' }));

      expect(await today().findByRole('alert')).toHaveTextContent(
        'Enter the Lunch break as whole minutes from 0 to 1439.',
      );
      expect(writes(server)).toEqual([]);
    });

    it('shows the server error when the Lunch break is not shorter than the time elapsed', async () => {
      const server = await renderApp([clockedIn()]);

      await userEvent.clear(lunchInput());
      await userEvent.type(lunchInput(), '150');
      await userEvent.click(today().getByRole('button', { name: 'Clock out' }));

      expect(await today().findByRole('alert')).toHaveTextContent(
        'Lunch break must be shorter than the time between Clock-in and Clock-out.',
      );
      expect(server.workdays()[0]?.clockOut).toBeNull();
    });

    it('updates the time so far as the clock advances', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      vi.setSystemTime(new Date('2026-11-11T10:30:00'));
      await renderApp([clockedIn()]);
      expect(today().getByText('2:30')).toBeInTheDocument();

      vi.setSystemTime(new Date('2026-11-11T11:00:00'));
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });

      expect(today().getByText('3:00')).toBeInTheDocument();
    });
  });

  describe('clocked out', () => {
    it('shows the Clock-in, Clock-out, Lunch break, Worked hours and the Balance of the day', async () => {
      await renderApp([workday('2026-11-11', '08:00', '17:30', 60)]);

      const card = today();
      expect(card.getByText('Clock-in').nextSibling).toHaveTextContent('08:00');
      expect(card.getByText('Clock-out').nextSibling).toHaveTextContent('17:30');
      expect(card.getByText('Lunch break').nextSibling).toHaveTextContent('1:00');
      expect(card.getByText('Worked hours').nextSibling).toHaveTextContent('8:30');
      expect(card.getByText('Balance').nextSibling).toHaveTextContent('+0:30');
      expect(card.queryByRole('button')).not.toBeInTheDocument();
    });

    it('shows a Half day against 4 expected hours', async () => {
      await renderApp([workday('2026-11-11', '08:00', '13:00', 0, true)]);

      expect(today().getByText('Worked hours').nextSibling).toHaveTextContent('5:00');
      expect(today().getByText('Balance').nextSibling).toHaveTextContent('+1:00');
    });

    it('marks the day incomplete instead of a Balance when there is no Lunch break', async () => {
      await renderApp([workday('2026-11-11', '08:00', '17:00', null)]);

      expect(today().getByText('Worked hours').nextSibling).toHaveTextContent('Incomplete');
      expect(today().queryByText('Balance')).not.toBeInTheDocument();
    });
  });
});
