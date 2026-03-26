// next/navigation must be mocked before any module that imports it transitively.
// vi.mock is hoisted by the Vitest transformer so this runs before imports.
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { DocumentUploadForm } from './DocumentUploadForm';

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => mockPush.mockClear());

async function fillAndSubmitForm(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['content'], 'test-document.pdf', {
    type: 'application/pdf',
  });
  await user.upload(screen.getByLabelText('Select document'), file);
  const dateInput = screen.getByLabelText('Date');
  await user.clear(dateInput);
  await user.type(dateInput, '2024-06-15');
  await user.tab();
  const descriptionInput = screen.getByLabelText('Description');
  await user.clear(descriptionInput);
  await user.type(descriptionInput, 'A test document');
  await user.tab();
  await waitFor(() => {
    expect(
      (screen.getByRole('button', { name: /upload/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  await user.click(screen.getByRole('button', { name: /upload/i }));
}

describe('DocumentUploadForm — 201 navigation', () => {
  it('navigates to /upload/success with query params after a successful upload', async () => {
    server.use(
      http.post('/api/documents/upload', () =>
        HttpResponse.json(
          {
            documentId: 'abc-123',
            description: 'A test document',
            date: '2024-06-15',
            archiveReference: '2024-06-15 — A test document',
            status: 'finalized',
          },
          { status: 201 },
        ),
      ),
    );

    render(
      <DocumentUploadForm
        maxFileSizeMb={10}
        acceptedExtensions={['.pdf', '.jpg']}
      />,
    );

    const user = userEvent.setup();
    await fillAndSubmitForm(user);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledOnce();
    });
    const calledWith: string = mockPush.mock.calls[0][0];
    expect(calledWith).toContain('/upload/success');
    // URLSearchParams encodes spaces as '+' not '%20'
    expect(calledWith).toContain('description=A+test+document');
    expect(calledWith).not.toContain('documentId');
  });
});

describe('DocumentUploadForm — 409 duplicate', () => {
  it('shows the duplicate conflict alert and re-enables the submit button', async () => {
    server.use(
      http.post('/api/documents/upload', () =>
        HttpResponse.json(
          {
            error: 'duplicate_detected',
            data: {
              existingRecord: {
                description: 'Existing doc',
                date: '2020-01-01',
                archiveReference: '2020-01-01 — Existing doc',
              },
            },
          },
          { status: 409 },
        ),
      ),
    );

    render(
      <DocumentUploadForm
        maxFileSizeMb={10}
        acceptedExtensions={['.pdf', '.jpg']}
      />,
    );

    const user = userEvent.setup();
    await fillAndSubmitForm(user);

    await waitFor(() => {
      expect(
        screen.getByText('A document with this file already exists:'),
      ).toBeDefined();
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: /upload/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
  });
});

describe('DocumentUploadForm — 5xx server error', () => {
  it('shows the server error message in an alert and re-enables the submit button', async () => {
    server.use(
      http.post('/api/documents/upload', () =>
        HttpResponse.json(
          { error: 'upload_failed', message: 'Storage unavailable' },
          { status: 500 },
        ),
      ),
    );

    render(
      <DocumentUploadForm
        maxFileSizeMb={10}
        acceptedExtensions={['.pdf', '.jpg']}
      />,
    );

    const user = userEvent.setup();
    await fillAndSubmitForm(user);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Storage unavailable');
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: /upload/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
  });
});

describe('DocumentUploadForm — in-flight loading state', () => {
  it('disables the submit button and shows "Uploading…" while the request is pending', async () => {
    server.use(
      http.post('/api/documents/upload', async () => {
        await delay('infinite');
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    render(
      <DocumentUploadForm
        maxFileSizeMb={10}
        acceptedExtensions={['.pdf', '.jpg']}
      />,
    );

    const user = userEvent.setup();

    // Upload a file — the filename stem is not a parseable date so date stays blank.
    const file = new File(['content'], 'test-document.pdf', {
      type: 'application/pdf',
    });
    const fileInput = screen.getByLabelText('Select document');
    await user.upload(fileInput, file);

    // Fill in date and blur to trigger onBlur validation.
    const dateInput = screen.getByLabelText('Date');
    await user.clear(dateInput);
    await user.type(dateInput, '2024-06-15');
    await user.tab();

    // Fill in description and blur.
    const descriptionInput = screen.getByLabelText('Description');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'A test document');
    await user.tab();

    // Wait for the form to become valid so the submit button is enabled.
    const submitButton = screen.getByRole('button', { name: /upload/i });
    await waitFor(() => {
      expect((submitButton as HTMLButtonElement).disabled).toBe(false);
    });

    // Submit the form — the MSW handler holds the request open with delay('infinite').
    await user.click(submitButton);

    // While the request is in-flight the button must be disabled and show 'Uploading…'.
    await waitFor(() => {
      const loadingButton = screen.getByRole('button', { name: /uploading/i });
      expect((loadingButton as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
