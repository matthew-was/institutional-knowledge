import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VocabularyQueueItem } from './VocabularyQueueItem';

// Mock Client Component children — Tier 1 tests focus on VocabularyQueueItem
// rendering; Accept/Reject button behaviour is tested in their own test files.
vi.mock('@/components/AcceptCandidateButton/AcceptCandidateButton', () => ({
  AcceptCandidateButton: ({ termId }: { termId: string }) => (
    <button type="button" aria-label="Accept term" data-term-id={termId}>
      Accept
    </button>
  ),
}));

vi.mock('@/components/RejectCandidateButton/RejectCandidateButton', () => ({
  RejectCandidateButton: ({ termId }: { termId: string }) => (
    <button type="button" aria-label="Reject term" data-term-id={termId}>
      Reject
    </button>
  ),
}));

const baseProps = {
  termId: '01927c3a-5b2e-7000-8000-000000000001',
  term: 'Thornfield Farm',
  category: 'Land Parcel / Field',
  confidence: 0.87,
  description: null,
  sourceDocumentDescription: 'Conveyance deed dated 1923',
  sourceDocumentDate: '1923-04-01',
  createdAt: '2026-03-01T10:00:00Z',
  onSuccess: vi.fn(),
};

describe('VocabularyQueueItem', () => {
  it('renders the term name', () => {
    render(<VocabularyQueueItem {...baseProps} />);

    expect(screen.getByText(/Thornfield Farm/).textContent).toContain(
      'Thornfield Farm',
    );
  });

  it('renders the category', () => {
    render(<VocabularyQueueItem {...baseProps} />);

    expect(screen.getByText(/Land Parcel \/ Field/).textContent).toContain(
      'Land Parcel / Field',
    );
  });

  it('renders the confidence score as a number', () => {
    render(<VocabularyQueueItem {...baseProps} />);

    expect(screen.getByText(/0\.87/).textContent).toContain('0.87');
  });

  it('renders "N/A" when confidence is null', () => {
    render(<VocabularyQueueItem {...baseProps} confidence={null} />);

    expect(screen.getByText(/N\/A/).textContent).toContain('N/A');
    // Confirm the numeric value is not shown when confidence is null.
    expect(screen.queryByText(/0\.87/)).toBeNull();
  });

  it('renders the source document description', () => {
    render(<VocabularyQueueItem {...baseProps} />);

    expect(
      screen.getByText(/Conveyance deed dated 1923/).textContent,
    ).toContain('Conveyance deed dated 1923');
  });

  it('contains an Accept button', () => {
    render(<VocabularyQueueItem {...baseProps} />);

    expect(
      screen.getByRole('button', { name: 'Accept term' }).textContent,
    ).toBe('Accept');
  });

  it('contains a Reject button', () => {
    render(<VocabularyQueueItem {...baseProps} />);

    expect(
      screen.getByRole('button', { name: 'Reject term' }).textContent,
    ).toBe('Reject');
  });
});
