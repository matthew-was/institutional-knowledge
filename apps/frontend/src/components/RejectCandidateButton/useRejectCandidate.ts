import useSWRMutation from 'swr/mutation';
import { fetchWrapper } from '@/lib/fetchWrapper';

async function rejectCandidate(
  key: string,
  _options: { arg: undefined },
): Promise<void> {
  const res = await fetchWrapper(key, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to reject term. Please try again.');
  }
}

export function useRejectCandidate(termId: string, onSuccess: () => void) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/curation/vocabulary/${termId}/reject`,
    rejectCandidate,
    { onSuccess },
  );

  async function handleReject() {
    await trigger(undefined).catch(() => undefined);
  }

  return {
    handleReject,
    isRejecting: isMutating,
    error: error instanceof Error ? error.message : null,
  };
}
