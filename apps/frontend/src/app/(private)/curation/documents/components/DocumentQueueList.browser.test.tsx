import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { DocumentQueueList } from './DocumentQueueList';

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const sampleItem = {
  documentId: '01927c3a-5b2e-7000-8000-000000000001',
  description: 'Wedding photograph',
  date: '1987-06-15',
  archiveReference: '1987-06-15 — Wedding photograph',
  flagReason: 'OCR quality below threshold',
  flaggedAt: '2026-03-13T10:00:00Z',
  submitterIdentity: 'Primary Archivist',
  pipelineStatus: 'ocr',
};

describe('DocumentQueueList', () => {
  it('renders a list item for each queue item', () => {
    const mutate = vi.fn();
    render(<DocumentQueueList items={[sampleItem]} mutate={mutate} />);

    expect(screen.getByText('Wedding photograph')).toBeDefined();
  });

  it('renders nothing when items array is empty', () => {
    const mutate = vi.fn();
    const { container } = render(
      <DocumentQueueList items={[]} mutate={mutate} />,
    );

    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(0);
  });

  it('calls mutate after a successful clear-flag POST', async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);

    mswServer.use(
      http.post(
        `/api/curation/documents/${sampleItem.documentId}/clear-flag`,
        () =>
          HttpResponse.json(
            { documentId: sampleItem.documentId, flagCleared: true },
            { status: 200 },
          ),
      ),
    );

    render(<DocumentQueueList items={[sampleItem]} mutate={mutate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear flag' }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  });

  it('shows loading state on the button while clear-flag request is in flight', async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);

    let resolveRequest: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });

    mswServer.use(
      http.post(
        `/api/curation/documents/${sampleItem.documentId}/clear-flag`,
        async () => {
          resolveRequest();
          await new Promise<void>((res) => setTimeout(res, 200));
          return HttpResponse.json(
            { documentId: sampleItem.documentId, flagCleared: true },
            { status: 200 },
          );
        },
      ),
    );

    render(<DocumentQueueList items={[sampleItem]} mutate={mutate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear flag' }));

    await requestStarted;
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Clear flag' }).textContent,
      ).toBe('Clearing…');
    });
  });

  it('shows an error message when clear-flag POST returns a non-ok response', async () => {
    const mutate = vi.fn();

    mswServer.use(
      http.post(
        `/api/curation/documents/${sampleItem.documentId}/clear-flag`,
        () =>
          HttpResponse.json(
            {
              error: 'no_active_flag',
              message: 'Document has no active flag.',
            },
            { status: 409 },
          ),
      ),
    );

    render(<DocumentQueueList items={[sampleItem]} mutate={mutate} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Clear flag' })),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });

    expect(mutate).not.toHaveBeenCalled();
  });
});
