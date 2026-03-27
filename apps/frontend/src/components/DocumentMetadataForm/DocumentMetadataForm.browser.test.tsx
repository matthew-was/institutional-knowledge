import type { DocumentDetailResponse } from '@institutional-knowledge/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentMetadataForm } from './DocumentMetadataForm';

const baseDocument: DocumentDetailResponse = {
  documentId: '01927c3a-5b2e-7000-8000-000000000001',
  description: 'Wedding photograph',
  date: '1987-06-15',
  archiveReference: '1987-06-15 — Wedding photograph',
  documentType: 'photograph',
  people: ['Alice Smith', 'Bob Jones'],
  organisations: ['Estate of John Smith'],
  landReferences: ['North Field'],
  submitterIdentity: 'Primary Archivist',
  status: 'finalized',
  flagReason: null,
  flaggedAt: null,
  createdAt: '2026-03-13T09:00:00Z',
  updatedAt: '2026-03-13T09:05:00Z',
};

describe('DocumentMetadataForm', () => {
  it('renders all metadata fields pre-populated from the document prop', () => {
    render(<DocumentMetadataForm document={baseDocument} />);

    const descInput = screen.getByLabelText(/Description/i) as HTMLInputElement;
    expect(descInput.value).toBe('Wedding photograph');

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('1987-06-15');

    const typeInput = screen.getByLabelText(
      /Document type/i,
    ) as HTMLInputElement;
    expect(typeInput.value).toBe('photograph');

    const peopleInput = screen.getByLabelText(/People/i) as HTMLInputElement;
    expect(peopleInput.value).toBe('Alice Smith, Bob Jones');

    const orgsInput = screen.getByLabelText(
      /Organisations/i,
    ) as HTMLInputElement;
    expect(orgsInput.value).toBe('Estate of John Smith');

    const landInput = screen.getByLabelText(
      /Land references/i,
    ) as HTMLInputElement;
    expect(landInput.value).toBe('North Field');
  });

  it('renders with an empty date field when document date is null', () => {
    render(<DocumentMetadataForm document={{ ...baseDocument, date: null }} />);

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    // Null date maps to empty string — no validation error on initial render.
    expect(dateInput.value).toBe('');
    // Confirm no error text is shown for the date field.
    expect(screen.queryByText(/Date must be/i)).toBeNull();
  });

  it('renders an accessible submit button', () => {
    render(<DocumentMetadataForm document={baseDocument} />);

    const submitButton = screen.getByRole('button', { name: /Save changes/i });
    expect(submitButton).toBeDefined();
    // Button is enabled on initial render (not submitting).
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
  });
});
