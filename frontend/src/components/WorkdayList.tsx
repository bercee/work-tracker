import { useState, type FC } from 'react';
import type { Workday } from '@work-tracker/contracts';
import { ApiError, deleteWorkday } from '../api';
import { isComplete, workedMinutes } from '../balance';
import { formatDate, formatDuration } from '../format';
import { WorkdayForm } from './WorkdayForm';
import './WorkdayList.css';

export interface WorkdayListProps {
  workdays: readonly Workday[];
  today: string;
  onChanged: () => Promise<void>;
}

const NONE = '–';

export const WorkdayList: FC<WorkdayListProps> = ({ workdays, today, onChanged }) => {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();

  // The API lists newest first, but the list must not depend on it.
  const sorted = workdays.toSorted((a, b) => b.date.localeCompare(a.date));

  const remove = async (workday: Workday) => {
    if (!window.confirm(`Delete the Workday on ${formatDate(workday.date)}?`)) return;
    setDeleteError(undefined);
    try {
      await deleteWorkday(workday.date);
      await onChanged();
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? cause.message : 'Unable to delete the Workday.');
    }
  };

  return (
    <section aria-label="Workdays" className="workday-list">
      <h2>Workdays</h2>

      {adding ? (
        <WorkdayForm
          today={today}
          onSaved={async () => {
            await onChanged();
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)}>
          Add past Workday
        </button>
      )}

      {deleteError !== undefined && <p role="alert">{deleteError}</p>}

      <ul>
        {sorted.map((workday) => {
          const worked = workedMinutes(workday);
          return (
            <li key={workday.date}>
              <header>
                <time dateTime={workday.date}>{formatDate(workday.date)}</time>
                {workday.halfDay && <span className="marker">Half day</span>}
                {!isComplete(workday) && <span className="marker marker-incomplete">Incomplete</span>}
              </header>
              {editing === workday.date ? (
                <WorkdayForm
                  workday={workday}
                  today={today}
                  onSaved={async () => {
                    await onChanged();
                    setEditing(undefined);
                  }}
                  onCancel={() => setEditing(undefined)}
                />
              ) : (
                <>
                  <dl>
                    <div>
                      <dt>Clock-in</dt>
                      <dd>{workday.clockIn}</dd>
                    </div>
                    <div>
                      <dt>Clock-out</dt>
                      <dd>{workday.clockOut ?? NONE}</dd>
                    </div>
                    <div>
                      <dt>Lunch break</dt>
                      <dd>{workday.lunchMinutes === null ? NONE : `${workday.lunchMinutes} min`}</dd>
                    </div>
                    <div>
                      <dt>Worked hours</dt>
                      <dd>{worked === null ? NONE : formatDuration(worked)}</dd>
                    </div>
                  </dl>
                  <div className="workday-list-actions">
                    <button type="button" onClick={() => setEditing(workday.date)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => void remove(workday)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
