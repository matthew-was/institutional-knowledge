import type { VocabularyCandidateItem } from '@institutional-knowledge/shared';
import useSWR, { type KeyedMutator } from 'swr';
import { fetchWrapper } from '@/lib/fetchWrapper';

const QUEUE_KEY = '/api/curation/vocabulary';

export interface UseVocabularyQueueResult {
  candidates: VocabularyCandidateItem[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: KeyedMutator<{ candidates: VocabularyCandidateItem[] }>;
}

async function fetcher(
  path: string,
): Promise<{ candidates: VocabularyCandidateItem[] }> {
  const res = await fetchWrapper(path);
  if (!res.ok) {
    throw new Error(`Failed to fetch vocabulary queue: ${res.status}`);
  }
  return res.json() as Promise<{ candidates: VocabularyCandidateItem[] }>;
}

export function useVocabularyQueue(): UseVocabularyQueueResult {
  const { data, isLoading, error, mutate } = useSWR(QUEUE_KEY, fetcher);

  return {
    candidates: data?.candidates ?? [],
    isLoading,
    error,
    mutate,
  };
}
