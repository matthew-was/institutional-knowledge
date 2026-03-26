import useSWRMutation from 'swr/mutation';
import { fetchWrapper } from '@/lib/fetchWrapper';

async function clearFlag(
  _key: string,
  { arg: documentId }: { arg: string },
): Promise<void> {
  const res = await fetchWrapper(
    `/api/curation/documents/${documentId}/clear-flag`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to clear flag. Please try again.');
  }
}

export function useClearFlag(documentId: string, onSuccess: () => void) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/curation/documents/${documentId}/clear-flag`,
    clearFlag,
    { onSuccess },
  );

  async function handleClear() {
    await trigger(documentId).catch(() => undefined);
  }

  return {
    handleClear,
    isClearing: isMutating,
    error: error instanceof Error ? error.message : null,
  };
}
