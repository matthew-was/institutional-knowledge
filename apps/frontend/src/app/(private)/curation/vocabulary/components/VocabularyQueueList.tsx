import type { VocabularyCandidateItem } from '@institutional-knowledge/shared';
import type { KeyedMutator } from 'swr';
import { VocabularyQueueItem } from './VocabularyQueueItem';

interface VocabularyQueueListProps {
  candidates: VocabularyCandidateItem[];
  mutate: KeyedMutator<{ candidates: VocabularyCandidateItem[] }>;
}

export function VocabularyQueueList({
  candidates,
  mutate,
}: VocabularyQueueListProps) {
  return (
    <ul>
      {candidates.map((candidate) => (
        <li key={candidate.termId}>
          <VocabularyQueueItem
            {...candidate}
            onSuccess={() => {
              mutate().catch(() => undefined);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
