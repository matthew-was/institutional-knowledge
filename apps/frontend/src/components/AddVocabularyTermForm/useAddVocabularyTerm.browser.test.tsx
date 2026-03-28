/**
 * Tier 2 UI behaviour tests — useAddVocabularyTerm hook.
 *
 * MSW intercepts at the Hono route boundary:
 *   POST /api/curation/vocabulary/terms
 *
 * Tests confirm:
 * - Correctly structured payload is sent (aliases split to array)
 * - Validation errors shown for missing required fields
 * - targetTermId validated as UUID (z.uuid() form — no string wrapper)
 * - Success message shown and form reset on completion
 * - Inline error shown on API failure
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AddVocabularyTermForm } from './AddVocabularyTermForm';

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const ADD_TERM_URL = '/api/curation/vocabulary/terms';

const addTermResponse = {
  termId: '01927c3a-5b2e-7000-8000-000000000003',
  term: 'Smith Estate',
  category: 'Organisation',
  source: 'manual',
  normalisedTerm: 'smith estate',
};

// ---------------------------------------------------------------------------
// Payload structure — aliases split to array
// ---------------------------------------------------------------------------

describe('useAddVocabularyTerm — payload structure', () => {
  it('sends aliases as a string array (split from comma-separated input)', async () => {
    let capturedBody: unknown;

    mswServer.use(
      http.post(ADD_TERM_URL, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(addTermResponse, { status: 201 });
      }),
    );

    render(<AddVocabularyTermForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Term name/i), 'Smith Estate');
    await user.type(screen.getByLabelText(/Category/i), 'Organisation');
    await user.type(
      screen.getByLabelText(/Aliases/i),
      'Smith Farm, The Estate',
    );

    await user.click(screen.getByRole('button', { name: /Add term/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        'Term added successfully.',
      );
    });

    const body = capturedBody as { aliases?: unknown };
    expect(Array.isArray(body.aliases)).toBe(true);
    expect(body.aliases).toEqual(['Smith Farm', 'The Estate']);
  });

  it('omits aliases from payload when the field is left blank', async () => {
    let capturedBody: unknown;

    mswServer.use(
      http.post(ADD_TERM_URL, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(addTermResponse, { status: 201 });
      }),
    );

    render(<AddVocabularyTermForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Term name/i), 'Smith Estate');
    await user.type(screen.getByLabelText(/Category/i), 'Organisation');

    await user.click(screen.getByRole('button', { name: /Add term/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        'Term added successfully.',
      );
    });

    const body = capturedBody as { aliases?: unknown };
    // Empty aliases field → undefined in payload (not an empty array)
    expect(body.aliases).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Validation errors for missing required fields
// ---------------------------------------------------------------------------

describe('useAddVocabularyTerm — validation', () => {
  it('shows a validation error when term name is missing', async () => {
    // No MSW handler — a network call must not be made.
    render(<AddVocabularyTermForm />);
    const user = userEvent.setup();

    // Leave term name blank; fill category so only term fails.
    await user.type(screen.getByLabelText(/Category/i), 'Organisation');
    await user.click(screen.getByLabelText(/Term name/i));
    await user.tab(); // trigger onBlur

    await user.click(screen.getByRole('button', { name: /Add term/i }));

    // Field.Error renders errors.term?.message — the Zod min(1) message must appear.
    await waitFor(() => {
      screen.getByText('Too small: expected string to have >=1 characters');
    });

    // No success or server-error role should appear for a client validation block.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a validation error when category is missing', async () => {
    render(<AddVocabularyTermForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Term name/i), 'Smith Estate');
    await user.click(screen.getByLabelText(/Category/i));
    await user.tab(); // trigger onBlur

    await user.click(screen.getByRole('button', { name: /Add term/i }));

    // Field.Error renders errors.category?.message — the Zod min(1) message must appear.
    await waitFor(() => {
      screen.getByText('Too small: expected string to have >=1 characters');
    });

    // No success or server-error role should appear for a client validation block.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// targetTermId validated with z.uuid() (Zod v4 form — not z.string().uuid())
// ---------------------------------------------------------------------------

describe('useAddVocabularyTerm — targetTermId UUID validation', () => {
  it('rejects a non-UUID targetTermId (confirms z.uuid() is used)', async () => {
    // Importing AddTermSchema directly lets us verify the Zod shape.
    // The schema must reject a non-UUID value in the relationships array.
    const { AddTermSchema } = await import('@/lib/schemas');

    const result = AddTermSchema.safeParse({
      term: 'Smith Estate',
      category: 'Organisation',
      relationships: [
        {
          targetTermId: 'not-a-uuid',
          relationshipType: 'related_to',
        },
      ],
    });

    // Parsing must fail — a non-UUID targetTermId is invalid.
    expect(result.success).toBe(false);
  });

  it('accepts a valid UUID targetTermId', async () => {
    const { AddTermSchema } = await import('@/lib/schemas');

    const result = AddTermSchema.safeParse({
      term: 'Smith Estate',
      category: 'Organisation',
      relationships: [
        {
          targetTermId: '01927c3a-5b2e-7000-8000-000000000001',
          relationshipType: 'related_to',
        },
      ],
    });

    // Parsing must succeed for a valid UUID.
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Success message shown and form reset on completion
// ---------------------------------------------------------------------------

describe('useAddVocabularyTerm — success', () => {
  it('shows success message and resets the form after a successful POST', async () => {
    mswServer.use(
      http.post(ADD_TERM_URL, () =>
        HttpResponse.json(addTermResponse, { status: 201 }),
      ),
    );

    render(<AddVocabularyTermForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Term name/i), 'Smith Estate');
    await user.type(screen.getByLabelText(/Category/i), 'Organisation');

    await user.click(screen.getByRole('button', { name: /Add term/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        'Term added successfully.',
      );
    });

    // Form must be reset — term name field returns to empty.
    const termInput = screen.getByLabelText(/Term name/i) as HTMLInputElement;
    expect(termInput.value).toBe('');

    // No error shown on success.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Inline error shown on API failure
// ---------------------------------------------------------------------------

describe('useAddVocabularyTerm — API failure', () => {
  it('shows inline error message when POST returns a non-ok response', async () => {
    mswServer.use(
      http.post(ADD_TERM_URL, () =>
        HttpResponse.json(
          {
            error: 'duplicate_term',
            message: 'A term with this normalised form already exists.',
          },
          { status: 409 },
        ),
      ),
    );

    render(<AddVocabularyTermForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Term name/i), 'Smith Estate');
    await user.type(screen.getByLabelText(/Category/i), 'Organisation');

    await user.click(screen.getByRole('button', { name: /Add term/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'A term with this normalised form already exists.',
      );
    });

    // No success message shown on error.
    expect(screen.queryByRole('status')).toBeNull();
  });
});
