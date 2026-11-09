import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BalanceChart } from '../../src/components/BalanceChart';

// Chart points of the worked example for Wednesday 2026-11-11.
const workedExamplePoints = [
  { date: '2026-11-06', balanceMinutes: 30 },
  { date: '2026-11-08', balanceMinutes: -330 },
  { date: '2026-11-09', balanceMinutes: -330 },
  { date: '2026-11-10', balanceMinutes: -270 },
];

describe('<BalanceChart />', () => {
  it('says so when there are no complete Workdays', () => {
    render(<BalanceChart points={[]} />);

    const region = screen.getByRole('region', { name: 'Balance over time' });
    expect(region).toHaveTextContent('No complete Workdays yet.');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('describes the latest Balance to assistive technology', () => {
    render(<BalanceChart points={workedExamplePoints} />);

    expect(screen.getByRole('img')).toHaveAccessibleName(expect.stringContaining('-4:30'));
  });
});
