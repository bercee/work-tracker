import { Fragment, useState, type FC } from 'react';
import type { Workday } from '@work-tracker/contracts';
import { ApiError, deleteWorkday } from '../api';
import { isComplete, workedMinutes } from '../balance';
import { formatDate, formatDuration, formatShortDate } from '../format';
import { WorkdayForm } from './WorkdayForm';
import './WorkdayList.css';

export interface WorkdayListProps {
  workdays: readonly Workday[];
  today: string;
  onChanged: () => Promise<void>;
}

const NONE = '–';
const COLUMNS = 7;

const PencilIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const CrossIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" className="num">
                In
              </th>
              <th scope="col" className="num">
                Out
              </th>
              <th scope="col" className="num">
                Lunch (min)
              </th>
              <th scope="col" className="num">
                Worked
              </th>
              <th scope="col">
                <span className="visually-hidden">Edit</span>
              </th>
              <th scope="col">
                <span className="visually-hidden">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((workday) => {
              const worked = workedMinutes(workday);
              const fullDate = formatDate(workday.date);
              return (
                <Fragment key={workday.date}>
                  <tr className={isComplete(workday) ? undefined : 'incomplete'}>
                    <td>
                      <time dateTime={workday.date} title={fullDate}>
                        {formatShortDate(workday.date, today)}
                      </time>
                      {workday.halfDay && (
                        <>
                          {' '}
                          <span className="half-day" role="img" aria-label="Half day" title="Half day">
                            ½
                          </span>
                        </>
                      )}
                      {!isComplete(workday) && (
                        <>
                          {' '}
                          <span className="visually-hidden">Incomplete</span>
                        </>
                      )}
                    </td>
                    <td className="num">{workday.clockIn}</td>
                    <td className="num">{workday.clockOut ?? NONE}</td>
                    <td className="num">{workday.lunchMinutes ?? NONE}</td>
                    <td className="num">{worked === null ? NONE : formatDuration(worked)}</td>
                    <td className="action">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit Workday on ${fullDate}`}
                        title={`Edit Workday on ${fullDate}`}
                        onClick={() => setEditing(workday.date)}
                      >
                        <PencilIcon />
                      </button>
                    </td>
                    <td className="action">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete Workday on ${fullDate}`}
                        title={`Delete Workday on ${fullDate}`}
                        onClick={() => void remove(workday)}
                      >
                        <CrossIcon />
                      </button>
                    </td>
                  </tr>
                  {editing === workday.date && (
                    <tr className="form-row">
                      <td colSpan={COLUMNS}>
                        <WorkdayForm
                          workday={workday}
                          today={today}
                          onSaved={async () => {
                            await onChanged();
                            setEditing(undefined);
                          }}
                          onCancel={() => setEditing(undefined)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
