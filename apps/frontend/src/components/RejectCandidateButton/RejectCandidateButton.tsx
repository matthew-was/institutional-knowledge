'use client';

import { useRejectCandidate } from './useRejectCandidate';

interface RejectCandidateButtonProps {
  termId: string;
  onSuccess: () => void;
}

export function RejectCandidateButton({
  termId,
  onSuccess,
}: RejectCandidateButtonProps) {
  const { handleReject, isRejecting, error } = useRejectCandidate(
    termId,
    onSuccess,
  );

  return (
    <div>
      <button
        type="button"
        aria-label="Reject term"
        disabled={isRejecting}
        aria-disabled={isRejecting}
        onClick={handleReject}
      >
        {isRejecting ? 'Rejecting…' : 'Reject'}
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
