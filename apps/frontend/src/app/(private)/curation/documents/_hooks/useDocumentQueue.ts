import type { DocumentQueueItem } from '@institutional-knowledge/shared';
import useSWR, { type KeyedMutator } from 'swr';
import { fetchWrapper } from '@/lib/fetchWrapper';

const QUEUE_KEY = '/api/curation/documents';

export interface UseDocumentQueueResult {
  items: DocumentQueueItem[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: KeyedMutator<{ documents: DocumentQueueItem[] }>;
}

async function fetcher(
  path: string,
): Promise<{ documents: DocumentQueueItem[] }> {
  const res = await fetchWrapper(path);
  if (!res.ok) {
    throw new Error(`Failed to fetch document queue: ${res.status}`);
  }
  return res.json() as Promise<{ documents: DocumentQueueItem[] }>;
}

export function useDocumentQueue(): UseDocumentQueueResult {
  const { data, isLoading, error, mutate } = useSWR(QUEUE_KEY, fetcher);

  return {
    items: data?.documents ?? [],
    isLoading,
    error,
    mutate,
  };
}
