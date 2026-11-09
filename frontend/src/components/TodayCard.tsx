import { useState, type FC, type FormEvent } from 'react';
import {
  createWorkdaySchema,
  patchWorkdaySchema,
  type PatchWorkdayRequest,
  type Workday,
} from '@work-tracker/contracts';
import { addWorkday, patchWorkday } from '../api';
import { defaultLunchMinutes, expectedMinutes, runningMinutes, workedMinutes } from '../balance';
import { currentTime, formatBalance, formatDate, formatDuration } from '../format';
import { numberOf, parseRequest } from '../form';
import './TodayCard.css';

export interface TodayCardProps {
  workday: Workday | undefined;
  today: string;
  now: string;
  onChanged: () => Promise<void>;
}

export const TodayCard: FC<TodayCardProps> = ({ workday, today, now, onChanged }) => {
  // Only what the user has typed; without it the input follows the saved value or the pre-fill.
  const [lunchDraft, setLunchDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Runs one request, then refreshes the list so the card renders from the saved state.
  const run = async (send: () => Promise<unknown>, onSaved?: () => void) => {
    setBusy(true);
    setError(undefined);
    try {
      await send();
      onSaved?.();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const clockIn = () => {
    // Sent as typed rather than as parsed, so the schema's defaults are left to the server.
    // The clock prop only refreshes every 30 seconds, so read the time again at the click.
    const body = { date: today, clockIn: currentTime() };
    const parsed = parseRequest(createWorkdaySchema, body);
    if ('error' in parsed) return setError(parsed.error);
    void run(() => addWorkday(body));
  };

  const patch = (date: string, body: PatchWorkdayRequest, onSaved?: () => void) => {
    const parsed = parseRequest(patchWorkdaySchema, body);
    if ('error' in parsed) return setError(parsed.error);
    void run(() => patchWorkday(date, parsed.data), onSaved);
  };

  let content;
  if (!workday) {
    content = (
      <>
        <p className="today-date">{formatDate(today)}</p>
        <button type="button" className="primary" disabled={busy} onClick={clockIn}>
          Clock in
        </button>
      </>
    );
  } else if (workday.clockOut === null) {
    const lunchText = lunchDraft ?? String(workday.lunchMinutes ?? defaultLunchMinutes(workday.halfDay));
    // An empty input means no Lunch break was entered, which is saved as null and leaves the day Incomplete.
    const lunchBody = (): PatchWorkdayRequest => ({ lunchMinutes: numberOf(lunchText) ?? null });
    const submit = (event: FormEvent) => {
      event.preventDefault();
      patch(workday.date, lunchBody(), () => setLunchDraft(undefined));
    };

    content = (
      <>
        <dl className="today-facts">
          <div>
            <dt>Clock-in</dt>
            <dd>{workday.clockIn}</dd>
          </div>
          <div>
            <dt>Today so far</dt>
            <dd>{formatDuration(runningMinutes(workday, now))}</dd>
          </div>
        </dl>
        <form className="today-lunch" onSubmit={submit}>
          <label>
            Lunch break (minutes)
            <input
              inputMode="numeric"
              value={lunchText}
              onChange={(event) => setLunchDraft(event.target.value)}
              aria-describedby={workday.lunchMinutes === null ? 'today-lunch-hint' : undefined}
            />
          </label>
          {workday.lunchMinutes === null && (
            <span id="today-lunch-hint" className="today-hint">
              Not saved yet
            </span>
          )}
          <button type="submit" disabled={busy}>
            Save lunch
          </button>
        </form>
        <label className="check">
          <input
            type="checkbox"
            checked={workday.halfDay}
            disabled={busy}
            onChange={(event) => patch(workday.date, { halfDay: event.target.checked })}
          />
          Half day
        </label>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() =>
            patch(workday.date, { clockOut: currentTime(), ...lunchBody() }, () => setLunchDraft(undefined))
          }
        >
          Clock out
        </button>
      </>
    );
  } else {
    const worked = workedMinutes(workday);
    content = (
      <dl className="today-facts">
        <div>
          <dt>Clock-in</dt>
          <dd>{workday.clockIn}</dd>
        </div>
        <div>
          <dt>Clock-out</dt>
          <dd>{workday.clockOut}</dd>
        </div>
        <div>
          <dt>Lunch break</dt>
          <dd>{workday.lunchMinutes === null ? 'Not entered' : formatDuration(workday.lunchMinutes)}</dd>
        </div>
        <div>
          <dt>Worked hours</dt>
          <dd>{worked === null ? 'Incomplete' : formatDuration(worked)}</dd>
        </div>
        {worked !== null && (
          <div>
            <dt>Balance</dt>
            <dd>{formatBalance(worked - expectedMinutes(workday))}</dd>
          </div>
        )}
      </dl>
    );
  }

  return (
    <section aria-label="Today" className="today-card">
      <h2>Today</h2>
      {content}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
};
