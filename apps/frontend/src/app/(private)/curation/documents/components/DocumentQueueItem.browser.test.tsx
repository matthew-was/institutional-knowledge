import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentQueueItem } from './DocumentQueueItem';

// Mock useClearFlag so DocumentQueueItem tests are pure rendering tests
// (Tier 1) — state machine behaviour is tested separately via the hook.
vi.mock('./useClearFlag', () => ({
  useClearFlag: vi.fn(() => ({
    handleClear: vi.fn(),
    isClearing: false,
    error: null,
  })),
}));

const baseProps = {
  documentId: '01927c3a-5b2e-7000-8000-000000000001',
  description: 'Wedding photograph',
  date: '1987-06-15',
  archiveReference: '1987-06-15 — Wedding photograph',
  flagReason: 'OCR quality below threshold',
  flaggedAt: '2026-03-13T10:00:00Z',
  submitterIdentity: 'Primary Archivist',
  pipelineStatus: 'ocr',
  onSuccess: vi.fn(),
};

describe('DocumentQueueItem', () => {
  it('renders description, flag reason, and submitter identity', () => {
    render(<DocumentQueueItem {...baseProps} />);

    expect(screen.getByText('Wedding photograph')).toBeDefined();
    expect(screen.getByText(/OCR quality below threshold/)).toBeDefined();
    expect(screen.getByText(/Primary Archivist/)).toBeDefined();
  });

  it('renders "Undated" when date is null', () => {
    render(<DocumentQueueItem {...baseProps} date={null} />);

    expect(screen.getByText(/Undated/)).toBeDefined();
    // Confirm the date is not rendered as a <time> element with the date value.
    expect(screen.queryByText('1987-06-15')).toBeNull();
  });

  it('renders the date string when date is non-null', () => {
    render(<DocumentQueueItem {...baseProps} date="1987-06-15" />);

    const timeEl = screen.getByText('1987-06-15');
    expect(timeEl).toBeDefined();
    // Confirm "Undated" is not shown when a real date is present.
    expect(screen.queryByText(/Undated/)).toBeNull();
  });

  it('contains a link to /curation/documents/:id', () => {
    render(<DocumentQueueItem {...baseProps} />);

    const link = screen.getByRole('link', { name: /Edit metadata/ });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).href).toContain(
      '/curation/documents/01927c3a-5b2e-7000-8000-000000000001',
    );
  });

  it('renders the clear flag button in loading state when isClearing is true', async () => {
    const { useClearFlag } = await import('./useClearFlag');
    vi.mocked(useClearFlag).mockReturnValueOnce({
      handleClear: vi.fn(),
      isClearing: true,
      error: null,
    });

    render(<DocumentQueueItem {...baseProps} />);

    const button = screen.getByRole('button', { name: 'Clear flag' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toBe('Clearing…');
  });

  it('renders the clear flag button with an error message when error is set', async () => {
    const { useClearFlag } = await import('./useClearFlag');
    vi.mocked(useClearFlag).mockReturnValueOnce({
      handleClear: vi.fn(),
      isClearing: false,
      error: 'Failed to clear flag. Please try again.',
    });

    render(<DocumentQueueItem {...baseProps} />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Failed to clear flag/)).toBeDefined();
  });
});
