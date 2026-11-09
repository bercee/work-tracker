import type { FC } from 'react';
import type { ChartPoint } from '../balance';

export interface BalanceChartProps {
  points: readonly ChartPoint[];
}

export const BalanceChart: FC<BalanceChartProps> = () => {
  return (
    <section aria-label="Balance over time">
      <h2>Balance over time</h2>
    </section>
  );
};
