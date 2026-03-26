import type { DocumentQueueItem as DocumentQueueItemType } from '@institutional-knowledge/shared';
import type { KeyedMutator } from 'swr';
import { DocumentQueueItem } from './DocumentQueueItem';

interface DocumentQueueListProps {
  items: DocumentQueueItemType[];
  mutate: KeyedMutator<{ documents: DocumentQueueItemType[] }>;
}

export function DocumentQueueList({ items, mutate }: DocumentQueueListProps) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.documentId}>
          <DocumentQueueItem
            {...item}
            onSuccess={() => {
              mutate().catch(() => undefined);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
