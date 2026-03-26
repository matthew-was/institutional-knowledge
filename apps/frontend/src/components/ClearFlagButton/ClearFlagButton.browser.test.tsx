import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClearFlagButton } from './ClearFlagButton';

describe('ClearFlagButton', () => {
  it('renders with accessible button label in idle state', () => {
    render(
      <ClearFlagButton onClick={vi.fn()} isLoading={false} error={null} />,
    );

    const button = screen.getByRole('button', { name: 'Clear flag' });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.textContent).toBe('Clear flag');
  });

  it('renders in loading state with disabled button and "Clearing…" text', () => {
    render(<ClearFlagButton onClick={vi.fn()} isLoading={true} error={null} />);

    const button = screen.getByRole('button', { name: 'Clear flag' });
    expect(button.textContent).toBe('Clearing…');
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders inline error message when error prop is set', () => {
    render(
      <ClearFlagButton
        onClick={vi.fn()}
        isLoading={false}
        error="Failed to clear flag. Please try again."
      />,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Failed to clear flag/)).toBeDefined();
  });

  it('does not render error message when error prop is null', () => {
    render(
      <ClearFlagButton onClick={vi.fn()} isLoading={false} error={null} />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
