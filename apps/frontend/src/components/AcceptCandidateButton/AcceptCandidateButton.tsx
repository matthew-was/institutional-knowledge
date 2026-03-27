'use client';

import { useAcceptCandidate } from './useAcceptCandidate';

interface AcceptCandidateButtonProps {
  termId: string;
  onSuccess: () => void;
}

export function AcceptCandidateButton({
  termId,
  onSuccess,
}: AcceptCandidateButtonProps) {
  const { handleAccept, isAccepting, error } = useAcceptCandidate(
    termId,
    onSuccess,
  );

  return (
    <div>
      <button
        type="button"
        aria-label="Accept term"
        disabled={isAccepting}
        aria-disabled={isAccepting}
        onClick={handleAccept}
      >
        {isAccepting ? 'Accepting…' : 'Accept'}
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
