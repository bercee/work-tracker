import { useState, type FC } from 'react';
import type { Workday } from '@work-tracker/contracts';
import { formatDate } from '../format';
import { WorkdayForm } from './WorkdayForm';
import './Warnings.css';

export interface WarningsProps {
  incomplete: readonly Workday[];
  today: string;
  onChanged: () => Promise<void>;
}

const missing = (workday: Workday): string => {
  const parts = [
    ...(workday.clockOut === null ? ['Clock-out'] : []),
    ...(workday.lunchMinutes === null ? ['Lunch break'] : []),
  ];
  return parts.join(' and ');
};

export const Warnings: FC<WarningsProps> = ({ incomplete, today, onChanged }) => {
  const [fixing, setFixing] = useState<string>();

  if (incomplete.length === 0) return null;

  return (
    <section aria-label="Warnings" className="warnings">
      <h2>Incomplete Workdays</h2>
      <ul>
        {incomplete.map((workday) => (
          <li key={workday.date}>
            <p>
              <strong>{formatDate(workday.date)}</strong> is missing its {missing(workday)}.
            </p>
            {fixing === workday.date ? (
              <WorkdayForm
                workday={workday}
                today={today}
                onSaved={async () => {
                  await onChanged();
                  setFixing(undefined);
                }}
                onCancel={() => setFixing(undefined)}
              />
            ) : (
              <button type="button" onClick={() => setFixing(workday.date)}>
                Fix
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
