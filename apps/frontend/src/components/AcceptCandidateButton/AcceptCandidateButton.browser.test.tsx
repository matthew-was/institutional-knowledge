import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AcceptCandidateButton } from './AcceptCandidateButton';

// Mock useAcceptCandidate so AcceptCandidateButton tests are pure rendering
// tests (Tier 1) — hook behaviour is tested separately.
vi.mock('./useAcceptCandidate', () => ({
  useAcceptCandidate: vi.fn(() => ({
    handleAccept: vi.fn(),
    isAccepting: false,
    error: null,
  })),
}));

describe('AcceptCandidateButton', () => {
  it('renders with an accessible button label in idle state', () => {
    render(
      <AcceptCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Accept term' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.textContent).toBe('Accept');
  });

  it('renders in loading state with a disabled button and "Accepting…" text', async () => {
    const { useAcceptCandidate } = await import('./useAcceptCandidate');
    vi.mocked(useAcceptCandidate).mockReturnValueOnce({
      handleAccept: vi.fn(),
      isAccepting: true,
      error: null,
    });

    render(
      <AcceptCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Accept term' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toBe('Accepting…');
  });

  it('renders an inline error message when error is set', async () => {
    const { useAcceptCandidate } = await import('./useAcceptCandidate');
    vi.mocked(useAcceptCandidate).mockReturnValueOnce({
      handleAccept: vi.fn(),
      isAccepting: false,
      error: 'Failed to accept term. Please try again.',
    });

    render(
      <AcceptCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Failed to accept term. Please try again.');
  });

  it('does not render an error message when error is null', () => {
    render(
      <AcceptCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
