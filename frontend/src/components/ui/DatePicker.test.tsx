import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  it('shows the formatted value and opens a calendar', async () => {
    const user = userEvent.setup();
    render(<DatePicker label="Due date" value="2026-09-15" onChange={() => {}} />);

    expect(screen.getByText('Sep 15, 2026')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Due date'));

    expect(screen.getByRole('dialog', { name: 'Choose date' })).toBeInTheDocument();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  it('emits an ISO date when a day is picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker label="Due date" value="2026-09-15" onChange={onChange} />);

    await user.click(screen.getByLabelText('Due date'));
    await user.click(screen.getByRole('button', { name: /September 20/ }));

    expect(onChange).toHaveBeenCalledWith('2026-09-20');
  });

  it('clears the value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker label="Due date" value="2026-09-15" onChange={onChange} />);

    await user.click(screen.getByLabelText('Clear date'));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('disables days before the minimum', async () => {
    const user = userEvent.setup();
    render(<DatePicker label="Due date" value="2026-09-15" min="2026-09-10" onChange={() => {}} />);

    await user.click(screen.getByLabelText('Due date'));

    expect(screen.getByRole('button', { name: /September 5th, 2026/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /September 12th, 2026/ })).toBeEnabled();
  });
});
