import { formatBalance } from '../format';
import './BalanceSummary.css';

export interface BalanceSummaryProps {
  weekMinutes: number;
  overallMinutes: number;
}

export function BalanceSummary({ weekMinutes, overallMinutes }: BalanceSummaryProps) {
  return (
    <section aria-label="Balance" className="balance-summary">
      <dl>
        <div>
          <dt>This week</dt>
          <dd>{formatBalance(weekMinutes)}</dd>
        </div>
        <div>
          <dt>Overall</dt>
          <dd>{formatBalance(overallMinutes)}</dd>
        </div>
      </dl>
    </section>
  );
}
