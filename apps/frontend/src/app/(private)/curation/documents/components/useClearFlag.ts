import { useState } from 'react';

export function useClearFlag(_documentId: string, onSuccess: () => void) {
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClear() {
    setIsClearing(true);
    setError(null);

    try {
      // Stub — replaced with clearDocumentFlag(documentId) in Task 9.
      await Promise.resolve();
      setIsClearing(false);
      onSuccess();
    } catch {
      setIsClearing(false);
      setError('Failed to clear flag. Please try again.');
    }
  }

  return { handleClear, isClearing, error };
}
