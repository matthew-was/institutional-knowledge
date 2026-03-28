import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VocabularyQueueList } from './VocabularyQueueList';

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const sampleCandidate = {
  termId: '01927c3a-5b2e-7000-8000-000000000001',
  term: 'Home Farm',
  category: 'land',
  confidence: 0.85,
  description: null,
  sourceDocumentDescription: 'Family letter from grandmother',
  sourceDocumentDate: '1985-06-20',
  createdAt: '2026-03-01T09:00:00Z',
};

describe('VocabularyQueueList', () => {
  it('renders a list item for each candidate', () => {
    const mutate = vi.fn();
    render(<VocabularyQueueList candidates={[sampleCandidate]} mutate={mutate} />);

    expect(screen.getByText('Term: Home Farm').textContent).toBe('Term: Home Farm');
  });

  it('renders nothing when candidates array is empty', () => {
    const mutate = vi.fn();
    const { container } = render(
      <VocabularyQueueList candidates={[]} mutate={mutate} />,
    );

    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(0);
  });

  it('calls mutate after a successful accept POST', async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);

    mswServer.use(
      http.post(
        `/api/curation/vocabulary/${sampleCandidate.termId}/accept`,
        () =>
          HttpResponse.json(
            { termId: sampleCandidate.termId, term: 'Home Farm', source: 'candidate_accepted' },
            { status: 200 },
          ),
      ),
    );

    render(<VocabularyQueueList candidates={[sampleCandidate]} mutate={mutate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Accept term' }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  });
});
