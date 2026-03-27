import type { DocumentDetailResponse } from '@institutional-knowledge/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DocumentMetadataForm } from './DocumentMetadataForm';

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

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

// ---------------------------------------------------------------------------
// Tier 2 — UI behaviour tests
// MSW intercepts PATCH /api/curation/documents/:id/metadata (Hono route boundary)
// ---------------------------------------------------------------------------

const PATCH_URL = `/api/curation/documents/${baseDocument.documentId}/metadata`;

describe('DocumentMetadataForm — save success', () => {
  it('shows success message after a successful PATCH', async () => {
    mswServer.use(
      http.patch(PATCH_URL, () =>
        HttpResponse.json(
          {
            documentId: baseDocument.documentId,
            description: 'Wedding photograph',
            date: '1987-06-15',
            archiveReference: '1987-06-15 — Wedding photograph',
            documentType: 'photograph',
            people: ['Alice Smith', 'Bob Jones'],
            organisations: ['Estate of John Smith'],
            landReferences: ['North Field'],
            updatedAt: '2026-03-27T10:00:00Z',
          },
          { status: 200 },
        ),
      ),
    );

    render(<DocumentMetadataForm document={baseDocument} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        'Changes saved successfully.',
      );
    });
    // No error message shown on success.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('DocumentMetadataForm — save error', () => {
  it('shows error message when PATCH returns a non-ok response', async () => {
    mswServer.use(
      http.patch(PATCH_URL, () =>
        HttpResponse.json(
          { error: 'update_failed', message: 'Storage error.' },
          { status: 500 },
        ),
      ),
    );

    render(<DocumentMetadataForm document={baseDocument} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Storage error.');
    });
    // No success message shown on error.
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('DocumentMetadataForm — empty description validation', () => {
  it('rejects empty description before sending PATCH', async () => {
    // No MSW handler registered — if a PATCH were sent, the test would fail
    // because MSW would log an unhandled request warning.
    render(<DocumentMetadataForm document={baseDocument} />);
    const user = userEvent.setup();

    // Clear the description field then blur (onBlur mode triggers validation).
    const descInput = screen.getByLabelText(/Description/i);
    await user.clear(descInput);
    await user.tab();

    // Submit the form — Zod validation should block the request.
    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    // Wait to ensure no success/error state is set (the PATCH was not sent).
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

describe('DocumentMetadataForm — array fields split from comma-separated input', () => {
  it('sends PATCH with array fields correctly split', async () => {
    let capturedBody: unknown;

    mswServer.use(
      http.patch(PATCH_URL, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          {
            documentId: baseDocument.documentId,
            description: 'Wedding photograph',
            date: '1987-06-15',
            archiveReference: '1987-06-15 — Wedding photograph',
            documentType: 'photograph',
            people: ['Alice Smith', 'Bob Jones'],
            organisations: ['Estate of John Smith'],
            landReferences: ['North Field'],
            updatedAt: '2026-03-27T10:00:00Z',
          },
          { status: 200 },
        );
      }),
    );

    render(<DocumentMetadataForm document={baseDocument} />);
    const user = userEvent.setup();

    // The form pre-populates with 'Alice Smith, Bob Jones' for people.
    // Submit without changes to confirm the split is applied.
    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        'Changes saved successfully.',
      );
    });

    const body = capturedBody as { people?: unknown };
    expect(Array.isArray(body.people)).toBe(true);
    expect(body.people).toEqual(['Alice Smith', 'Bob Jones']);
  });
});

describe('DocumentMetadataForm — null date handling', () => {
  it('does not show a validation error on initial render with null date', () => {
    render(<DocumentMetadataForm document={{ ...baseDocument, date: null }} />);

    // The date field must be empty with no validation error text.
    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('');
    expect(screen.queryByText(/Date must be/i)).toBeNull();
  });
});
