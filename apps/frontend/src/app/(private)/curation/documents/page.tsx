'use client';

import { useDocumentQueue } from './_hooks/useDocumentQueue';
import { DocumentQueueList } from './components/DocumentQueueList';

export default function CurationDocumentsPage() {
  const { items, isLoading, error, mutate } = useDocumentQueue();

  if (isLoading) {
    return <p>Loading document queue…</p>;
  }

  if (error !== undefined) {
    return (
      <div role="alert">
        <p>Failed to load document queue. Please try again.</p>
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

  if (items.length === 0) {
    return <p>No documents are currently flagged for review.</p>;
  }

  return (
    <>
      <h1>Document Curation Queue</h1>
      <DocumentQueueList items={items} mutate={mutate} />
    </>
  );
}
