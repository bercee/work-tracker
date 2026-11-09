import { useId, useState, type FormEvent } from 'react';
import { createWorkdaySchema, workdayFieldsSchema, type Workday } from '@work-tracker/contracts';
import { addWorkday, ApiError, patchWorkday } from '../api';
import { defaultLunchMinutes } from '../balance';
import { numberOf, parseRequest } from '../form';
import './WorkdayForm.css';

export interface WorkdayFormProps {
  /** The Workday being corrected; omit to add a new one. */
  workday?: Workday;
  today: string;
  /** Called after a successful save, once the list has been refreshed. */
  onSaved: () => Promise<void>;
  onCancel: () => void;
}

export function WorkdayForm({ workday, today, onSaved, onCancel }: WorkdayFormProps) {
  const id = useId();
  const [date, setDate] = useState(workday?.date ?? '');
  const [clockIn, setClockIn] = useState(workday?.clockIn ?? '');
  const [clockOut, setClockOut] = useState(workday?.clockOut ?? '');
  const [halfDay, setHalfDay] = useState(workday?.halfDay ?? false);
  // Only a typed value is a draft. Without one the field follows the Half day pre-fill, which is shown but not saved
  // until the form is submitted.
  const [lunchDraft, setLunchDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const savedLunch = workday?.lunchMinutes ?? undefined;
  const lunchText = lunchDraft ?? String(savedLunch ?? defaultLunchMinutes(halfDay));
  const lunchUnsaved = lunchDraft === undefined && savedLunch === undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    const fields = {
      clockIn,
      clockOut: clockOut === '' ? null : clockOut,
      lunchMinutes: numberOf(lunchText) ?? null,
      halfDay,
    };

    if (workday === undefined) {
      const parsed = parseRequest(createWorkdaySchema, { date, ...fields });
      if ('error' in parsed) return setError(parsed.error);
      if (parsed.data.date > today) return setError('The date cannot be in the future.');
      await send(() => addWorkday(parsed.data));
    } else {
      const parsed = parseRequest(workdayFieldsSchema, fields);
      if ('error' in parsed) return setError(parsed.error);
      await send(() => patchWorkday(workday.date, parsed.data));
    }
  };

  const send = async (save: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await save();
      await onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to save the Workday.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="workday-form" onSubmit={(event) => void submit(event)} noValidate>
      <label htmlFor={`${id}-date`}>Date</label>
      <input
        id={`${id}-date`}
        type="date"
        value={date}
        max={today}
        readOnly={workday !== undefined}
        onChange={(event) => setDate(event.target.value)}
      />

      <label htmlFor={`${id}-in`}>Clock-in</label>
      <input id={`${id}-in`} type="time" value={clockIn} onChange={(event) => setClockIn(event.target.value)} />

      <label htmlFor={`${id}-out`}>Clock-out</label>
      <input id={`${id}-out`} type="time" value={clockOut} onChange={(event) => setClockOut(event.target.value)} />

      <label htmlFor={`${id}-lunch`}>Lunch break (minutes)</label>
      <input
        id={`${id}-lunch`}
        type="number"
        inputMode="numeric"
        min={0}
        value={lunchText}
        aria-describedby={lunchUnsaved ? `${id}-lunch-hint` : undefined}
        onChange={(event) => setLunchDraft(event.target.value)}
      />
      {lunchUnsaved && (
        <small id={`${id}-lunch-hint`} className="workday-form-hint">
          Not saved yet
        </small>
      )}

      <label className="workday-form-check">
        <input type="checkbox" checked={halfDay} onChange={(event) => setHalfDay(event.target.checked)} />
        Half day
      </label>

      {error !== undefined && (
        <p role="alert" className="workday-form-error">
          {error}
        </p>
      )}

      <div className="workday-form-actions">
        <button type="submit" disabled={saving}>
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
