import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart, DonutChart, LineChart } from './Charts';

describe('LineChart', () => {
  it('renders an accessible summary of the series', () => {
    render(
      <LineChart
        title="Tasks created per day"
        points={[
          { label: '2026-06-01', value: 2 },
          { label: '2026-06-02', value: 5 },
        ]}
      />,
    );

    const chart = screen.getByRole('img', { name: /Tasks created per day/ });
    expect(chart).toHaveAccessibleName(/2026-06-01: 2/);
    expect(chart).toHaveAccessibleName(/2026-06-02: 5/);
    expect(screen.getByText('Peak: 5')).toBeInTheDocument();
  });

  it('shows an empty state without points', () => {
    render(<LineChart title="Nothing" points={[]} />);
    expect(screen.getByText('No data for this period.')).toBeInTheDocument();
  });
});

describe('BarChart', () => {
  it('renders a row per bar with counts', () => {
    render(
      <BarChart
        title="Tasks by priority"
        bars={[
          { label: 'High', value: 4, color: '#f97316' },
          { label: 'Low', value: 1 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: /High: 4, Low: 1/ })).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows an empty state without bars', () => {
    render(<BarChart bars={[]} title="Nothing" />);
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });
});

describe('DonutChart', () => {
  it('renders the total and per-slice percentages', () => {
    render(
      <DonutChart
        title="Tasks by status"
        slices={[
          { label: 'Done', value: 3, color: '#22c55e' },
          { label: 'Open', value: 1, color: '#3b82f6' },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: /Done: 3, Open: 1/ })).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('3 · 75%')).toBeInTheDocument();
    expect(screen.getByText('1 · 25%')).toBeInTheDocument();
  });

  it('shows an empty state when everything is zero', () => {
    render(<DonutChart title="Nothing" slices={[{ label: 'Done', value: 0 }]} />);
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });
});
