import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RejectCandidateButton } from './RejectCandidateButton';

// Mock useRejectCandidate so RejectCandidateButton tests are pure rendering
// tests (Tier 1) — hook behaviour is tested separately.
vi.mock('./useRejectCandidate', () => ({
  useRejectCandidate: vi.fn(() => ({
    handleReject: vi.fn(),
    isRejecting: false,
    error: null,
  })),
}));

describe('RejectCandidateButton', () => {
  it('renders with an accessible button label in idle state', () => {
    render(
      <RejectCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Reject term' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.textContent).toBe('Reject');
  });

  it('renders in loading state with a disabled button and "Rejecting…" text', async () => {
    const { useRejectCandidate } = await import('./useRejectCandidate');
    vi.mocked(useRejectCandidate).mockReturnValueOnce({
      handleReject: vi.fn(),
      isRejecting: true,
      error: null,
    });

    render(
      <RejectCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Reject term' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toBe('Rejecting…');
  });

  it('renders an inline error message when error is set', async () => {
    const { useRejectCandidate } = await import('./useRejectCandidate');
    vi.mocked(useRejectCandidate).mockReturnValueOnce({
      handleReject: vi.fn(),
      isRejecting: false,
      error: 'Failed to reject term. Please try again.',
    });

    render(
      <RejectCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Failed to reject term. Please try again.');
  });

  it('does not render an error message when error is null', () => {
    render(
      <RejectCandidateButton
        termId="01927c3a-5b2e-7000-8000-000000000001"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
