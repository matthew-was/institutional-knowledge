import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DuplicateConflictAlert } from './DuplicateConflictAlert';

describe('DuplicateConflictAlert', () => {
  it('renders description, date, and archive reference', () => {
    render(
      <DuplicateConflictAlert
        existingRecord={{
          description: 'Family portrait',
          date: '1965-07-04',
          archiveReference: 'REF-001',
        }}
      />,
    );

    expect(screen.getByText(/Family portrait/)).toBeDefined();
    expect(screen.getByText(/1965-07-04/)).toBeDefined();
    expect(screen.getByText(/REF-001/)).toBeDefined();
  });

  it('renders "Undated" when date is null', () => {
    render(
      <DuplicateConflictAlert
        existingRecord={{
          description: 'Unknown document',
          date: null,
          archiveReference: 'REF-002',
        }}
      />,
    );

    expect(screen.getByText(/Undated/)).toBeDefined();
  });
});
