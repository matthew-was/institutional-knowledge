'use client';

import { Button } from '@base-ui/react/button';
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
      <Button
        type="button"
        aria-label="Reject term"
        disabled={isRejecting}
        aria-disabled={isRejecting}
        onClick={handleReject}
      >
        {isRejecting ? 'Rejecting…' : 'Reject'}
      </Button>
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
