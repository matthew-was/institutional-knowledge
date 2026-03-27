import useSWRMutation from 'swr/mutation';
import { fetchWrapper } from '@/lib/fetchWrapper';

async function acceptCandidate(
  key: string,
  _options: { arg: undefined },
): Promise<void> {
  const res = await fetchWrapper(key, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to accept term. Please try again.');
  }
}

export function useAcceptCandidate(termId: string, onSuccess: () => void) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/curation/vocabulary/${termId}/accept`,
    acceptCandidate,
    { onSuccess },
  );

  async function handleAccept() {
    await trigger(undefined).catch(() => undefined);
  }

  return {
    handleAccept,
    isAccepting: isMutating,
    error: error instanceof Error ? error.message : null,
  };
}
