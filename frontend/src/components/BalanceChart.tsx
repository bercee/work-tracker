import type { FC } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { ChartPoint } from '../balance';
import { formatBalance, formatDate } from '../format';
import './BalanceChart.css';

export interface BalanceChartProps {
  points: readonly ChartPoint[];
}

const LINE = '#2a78d6';
const INK = '#46525e';
const GRID = '#e3e8ee';
const ZERO = '#8895a3';

// Whole-hour ticks, so the axis never reads "+2.5h", always including 0.
const MAX_Y_TICKS = 5;
const hourTicks = (points: readonly ChartPoint[]): number[] => {
  const hours = points.map((point) => point.balanceMinutes / 60);
  const low = Math.floor(Math.min(0, ...hours));
  const high = Math.ceil(Math.max(0, ...hours));
  const step = Math.max(1, Math.ceil((high - low) / (MAX_Y_TICKS - 1)));
  const first = Math.floor(low / step) * step;
  const count = Math.ceil((high - first) / step) + 1;
  return Array.from({ length: count }, (_, index) => (first + index * step) * 60);
};

const formatHours = (minutes: number): string => {
  const hours = Math.round(minutes / 60);
  return hours > 0 ? `+${hours}h` : `${hours}h`;
};

// Same locale as formatDate, but without the year so ticks stay short on a phone.
const formatShortDate = (date: string): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });

const ChartTooltip = ({ active, payload }: TooltipContentProps) => {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="balance-chart-tooltip">
      <p>{formatDate(point.date)}</p>
      <p className="balance-chart-tooltip-value">{formatBalance(point.balanceMinutes)}</p>
    </div>
  );
};

export const BalanceChart: FC<BalanceChartProps> = ({ points }) => {
  const latest = points.at(-1);
  const yTicks = hourTicks(points);

  return (
    <section aria-label="Balance over time" className="balance-chart">
      <h2>Balance over time</h2>
      {latest === undefined ? (
        <p>No complete Workdays yet.</p>
      ) : (
        <div
          className="balance-chart-plot"
          role="img"
          aria-label={`Balance over time. Latest Balance ${formatBalance(latest.balanceMinutes)} on ${formatDate(latest.date)}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...points]} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                interval="preserveStartEnd"
                minTickGap={32}
                tick={{ fill: INK, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis
                ticks={yTicks}
                domain={[yTicks[0] ?? 0, yTicks.at(-1) ?? 0]}
                tickFormatter={formatHours}
                width={44}
                tick={{ fill: INK, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine y={0} stroke={ZERO} />
              <Tooltip content={ChartTooltip} cursor={{ stroke: ZERO, strokeWidth: 1 }} isAnimationActive={false} />
              <Line
                type="linear"
                dataKey="balanceMinutes"
                stroke={LINE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'white', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
