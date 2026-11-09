import type { FC } from 'react';
import type { Workday } from '@work-tracker/contracts';

export interface WorkdayListProps {
  workdays: readonly Workday[];
  today: string;
  onChanged: () => Promise<void>;
}

export const WorkdayList: FC<WorkdayListProps> = () => {
  return (
    <section aria-label="Workdays">
      <h2>Workdays</h2>
    </section>
  );
};
