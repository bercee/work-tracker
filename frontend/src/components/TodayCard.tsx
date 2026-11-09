import type { FC } from 'react';
import type { Workday } from '@work-tracker/contracts';

export interface TodayCardProps {
  workday: Workday | undefined;
  today: string;
  now: string;
  onChanged: () => Promise<void>;
}

export const TodayCard: FC<TodayCardProps> = () => {
  return (
    <section aria-label="Today">
      <h2>Today</h2>
    </section>
  );
};
