import { render, screen, within } from '@testing-library/react';
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
const warnings = () => within(screen.getByRole('region', { name: 'Warnings' }));
const workdaysRegion = () => within(screen.getByRole('region', { name: 'Workdays' }));

// Rows carry their date as a machine-readable <time>, so tests find one without depending on the display format.
const rowFor = (date: string) => {
  const row = document.querySelector(`[aria-label="Workdays"] time[datetime="${date}"]`)?.closest('li');
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${date}`);
  return within(row);
};

const load = async (initial: Workday[] = workedExample) => {
  const server = installFakeServer(initial);
  render(<App />);
  await screen.findByRole('region', { name: 'Balance' });
  return server;
};

const fill = async (scope: ReturnType<typeof within>, label: string, text: string) => {
  const input = scope.getByLabelText(label);
  await userEvent.clear(input);
  if (text !== '') await userEvent.type(input, text);
};

const mutations = (server: ReturnType<typeof installFakeServer>) =>
  server.requests.filter((request) => request.method !== 'GET');

describe('Warnings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T10:30:00'));
  });

  it('names what each Incomplete Workday before today is missing, oldest first', async () => {
    await load();

    const items = warnings().getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Lunch break');
    expect(items[0]).not.toHaveTextContent('Clock-out');
    expect(items[1]).toHaveTextContent('Clock-out');
    expect(items[1]).not.toHaveTextContent('Lunch break');
  });

  it('names both when a Workday is missing its Clock-out and its Lunch break', async () => {
    await load([workday('2026-11-09', '08:00', null, null)]);

    expect(warnings().getByRole('listitem')).toHaveTextContent('Clock-out and Lunch break');
  });

  it('does not warn about an Incomplete Workday today, a future one or a date with no Workday', async () => {
    await load([
      workday('2026-11-11', '08:00', null, null),
      workday('2026-11-12', '08:00', null, null),
      workday('2026-11-06', '08:00', '17:30', 60),
    ]);

    expect(screen.queryByRole('region', { name: 'Warnings' })).not.toBeInTheDocument();
  });

  it('completes a Workday with Fix, which moves the Balance and removes the warning', async () => {
    const server = await load();

    await userEvent.click(within(warnings().getAllByRole('listitem')[0]!).getByRole('button', { name: 'Fix' }));
    const form = warnings();
    expect(form.getByLabelText('Date')).toHaveValue('2026-11-04');
    expect(form.getByLabelText('Date')).toHaveAttribute('readonly');
    await fill(form, 'Lunch break (minutes)', '30');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    // 08:00-17:00 less 30 minutes is 510 minutes against 480 expected: +0:30 on top of -4:30.
    await vi.waitFor(() => expect(figure('Overall')).toHaveTextContent('-4:00'));
    expect(figure('This week')).toHaveTextContent('+1:00');
    expect(warnings().getAllByRole('listitem')).toHaveLength(1);
    expect(server.workdays().find((day) => day.date === '2026-11-04')?.lunchMinutes).toBe(30);
  });

  it('removes the last warning region once every Incomplete Workday is fixed', async () => {
    await load([workday('2026-11-05', '08:00', null, 60)]);

    await userEvent.click(warnings().getByRole('button', { name: 'Fix' }));
    await fill(warnings(), 'Clock-out', '18:00');
    await userEvent.click(warnings().getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'Warnings' })).not.toBeInTheDocument());
    // 08:00-18:00 less 60 minutes is 540 minutes: +1:00.
    expect(figure('Overall')).toHaveTextContent('+1:00');
  });
});

describe('Workday list', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T10:30:00'));
  });

  it('lists Workdays newest first with their Clock-in, Clock-out, Lunch break, Worked hours and markers', async () => {
    await load();

    const dates = [...document.querySelectorAll('[aria-label="Workdays"] time')].map((time) =>
      time.getAttribute('datetime'),
    );
    expect(dates).toEqual([
      '2026-11-12',
      '2026-11-11',
      '2026-11-10',
      '2026-11-09',
      '2026-11-08',
      '2026-11-06',
      '2026-11-05',
      '2026-11-04',
    ]);

    const complete = rowFor('2026-11-06');
    expect(complete.getByText('08:00')).toBeInTheDocument();
    expect(complete.getByText('17:30')).toBeInTheDocument();
    expect(complete.getByText('60 min')).toBeInTheDocument();
    expect(complete.getByText('8:30')).toBeInTheDocument();
    expect(complete.queryByText('Incomplete')).not.toBeInTheDocument();
    expect(complete.queryByText('Half day')).not.toBeInTheDocument();

    expect(rowFor('2026-11-10').getByText('Half day')).toBeInTheDocument();
    expect(rowFor('2026-11-05').getByText('Incomplete')).toBeInTheDocument();
    expect(rowFor('2026-11-08').getByText('0 min')).toBeInTheDocument();
  });

  it('adds a past Workday, saving the pre-filled Lunch break on submit', async () => {
    const server = await load();

    await userEvent.click(workdaysRegion().getByRole('button', { name: 'Add past Workday' }));
    const form = workdaysRegion();
    expect(form.getByLabelText('Date')).toHaveAttribute('max', '2026-11-11');
    expect(form.getByLabelText('Lunch break (minutes)')).toHaveValue(60);
    expect(mutations(server)).toHaveLength(0);

    await fill(form, 'Date', '2026-11-03');
    await fill(form, 'Clock-in', '08:00');
    await fill(form, 'Clock-out', '16:00');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(rowFor('2026-11-03').getByText('7:00')).toBeInTheDocument());
    expect(mutations(server)).toEqual([
      {
        method: 'POST',
        path: '/api/days',
        body: { date: '2026-11-03', clockIn: '08:00', clockOut: '16:00', lunchMinutes: 60, halfDay: false },
      },
    ]);
    // 7:00 worked against 8:00 expected, in the previous week: overall -4:30 - 1:00.
    expect(figure('Overall')).toHaveTextContent('-5:30');
    expect(figure('This week')).toHaveTextContent('+1:00');
    expect(form.queryByLabelText('Date')).not.toBeInTheDocument();
  });

  it('sends a blank Clock-out and a blank Lunch break as null', async () => {
    const server = await load();

    await userEvent.click(workdaysRegion().getByRole('button', { name: 'Add past Workday' }));
    const form = workdaysRegion();
    await fill(form, 'Date', '2026-11-02');
    await fill(form, 'Clock-in', '09:00');
    await fill(form, 'Lunch break (minutes)', '');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(mutations(server)).toHaveLength(1));
    expect(mutations(server)[0]?.body).toEqual({
      date: '2026-11-02',
      clockIn: '09:00',
      clockOut: null,
      lunchMinutes: null,
      halfDay: false,
    });
  });

  it('pre-fills a Lunch break of 0 on a Half day', async () => {
    await load();

    await userEvent.click(workdaysRegion().getByRole('button', { name: 'Add past Workday' }));
    const form = workdaysRegion();
    await userEvent.click(form.getByLabelText('Half day'));

    expect(form.getByLabelText('Lunch break (minutes)')).toHaveValue(0);
  });

  it('refuses a future date without sending a request', async () => {
    const server = await load();

    await userEvent.click(workdaysRegion().getByRole('button', { name: 'Add past Workday' }));
    const form = workdaysRegion();
    await fill(form, 'Date', '2026-11-12');
    await fill(form, 'Clock-in', '08:00');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    expect(await form.findByRole('alert')).toHaveTextContent('future');
    expect(mutations(server)).toHaveLength(0);
  });

  it('shows a validation message without sending a request when Clock-out is not after Clock-in', async () => {
    const server = await load();

    await userEvent.click(workdaysRegion().getByRole('button', { name: 'Add past Workday' }));
    const form = workdaysRegion();
    await fill(form, 'Date', '2026-11-03');
    await fill(form, 'Clock-in', '09:00');
    await fill(form, 'Clock-out', '08:00');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    expect(await form.findByRole('alert')).toHaveTextContent('Clock-out must be after Clock-in.');
    expect(mutations(server)).toHaveLength(0);
  });

  it('shows the conflict message when a Workday already exists for the date', async () => {
    const server = await load();

    await userEvent.click(workdaysRegion().getByRole('button', { name: 'Add past Workday' }));
    const form = workdaysRegion();
    await fill(form, 'Date', '2026-11-06');
    await fill(form, 'Clock-in', '08:00');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    expect(await form.findByRole('alert')).toHaveTextContent('A Workday already exists for that date.');
    expect(server.workdays().find((day) => day.date === '2026-11-06')?.clockOut).toBe('17:30');
  });

  it('edits a Workday with a PATCH and updates the Balance', async () => {
    const server = await load();

    await userEvent.click(rowFor('2026-11-06').getByRole('button', { name: 'Edit' }));
    const form = rowFor('2026-11-06');
    expect(form.getByLabelText('Date')).toHaveValue('2026-11-06');
    expect(form.getByLabelText('Date')).toHaveAttribute('readonly');
    await fill(form, 'Clock-out', '18:30');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(rowFor('2026-11-06').getByText('9:30')).toBeInTheDocument());
    expect(mutations(server)).toEqual([
      {
        method: 'PATCH',
        path: '/api/days/2026-11-06',
        body: { clockIn: '08:00', clockOut: '18:30', lunchMinutes: 60, halfDay: false },
      },
    ]);
    // 9:30 worked is +1:30 instead of +0:30, so overall -4:30 becomes -3:30.
    expect(figure('Overall')).toHaveTextContent('-3:30');
  });

  it('shows a server error when an edit is rejected', async () => {
    const server = await load();

    await userEvent.click(rowFor('2026-11-06').getByRole('button', { name: 'Edit' }));
    server.failNext(404, 'NOT_FOUND');
    await userEvent.click(rowFor('2026-11-06').getByRole('button', { name: 'Save' }));

    expect(await rowFor('2026-11-06').findByRole('alert')).toHaveTextContent('Not found.');
  });

  it('leaves the data unchanged when an edit is cancelled', async () => {
    const server = await load();
    const before = server.workdays();

    await userEvent.click(rowFor('2026-11-06').getByRole('button', { name: 'Edit' }));
    await fill(rowFor('2026-11-06'), 'Clock-out', '20:00');
    await userEvent.click(rowFor('2026-11-06').getByRole('button', { name: 'Cancel' }));

    expect(mutations(server)).toHaveLength(0);
    expect(server.workdays()).toEqual(before);
    expect(rowFor('2026-11-06').getByText('17:30')).toBeInTheDocument();
    expect(rowFor('2026-11-06').queryByLabelText('Clock-out')).not.toBeInTheDocument();
  });

  it('deletes a Workday once confirmed', async () => {
    const server = await load();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await userEvent.click(rowFor('2026-11-06').getByRole('button', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(document.querySelector('time[datetime="2026-11-06"]')).toBeNull());
    expect(mutations(server)).toEqual([{ method: 'DELETE', path: '/api/days/2026-11-06', body: undefined }]);
    // The +0:30 Workday is gone: overall -4:30 becomes -5:00.
    expect(figure('Overall')).toHaveTextContent('-5:00');
  });

  it('keeps the Workday when the deletion is not confirmed', async () => {
    const server = await load();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await userEvent.click(rowFor('2026-11-06').getByRole('button', { name: 'Delete' }));

    expect(mutations(server)).toHaveLength(0);
    expect(rowFor('2026-11-06').getByText('17:30')).toBeInTheDocument();
    expect(figure('Overall')).toHaveTextContent('-4:30');
  });
});
