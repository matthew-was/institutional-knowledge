'use client';

import { useVocabularyQueue } from './_hooks/useVocabularyQueue';
import { VocabularyQueueList } from './components/VocabularyQueueList';

export default function VocabularyQueuePage() {
  const { candidates, isLoading, error, mutate } = useVocabularyQueue();

  if (isLoading) {
    return <p>Loading vocabulary queue…</p>;
  }

  if (error !== undefined) {
    return (
      <div role="alert">
        <p>Failed to load vocabulary queue. Please try again.</p>
        <button
          type="button"
          onClick={() => {
            mutate().catch(() => undefined);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (candidates.length === 0) {
    return <p>No vocabulary candidates are currently awaiting review.</p>;
  }

  return (
    <>
      <h1>Vocabulary Review Queue</h1>
      <VocabularyQueueList candidates={candidates} mutate={mutate} />
    </>
  );
}
