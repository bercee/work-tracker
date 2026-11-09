import type { FC } from 'react';
import type { Workday } from '@work-tracker/contracts';

export interface WarningsProps {
  incomplete: readonly Workday[];
  today: string;
  onChanged: () => Promise<void>;
}

export const Warnings: FC<WarningsProps> = () => {
  return <section aria-label="Warnings" />;
};
