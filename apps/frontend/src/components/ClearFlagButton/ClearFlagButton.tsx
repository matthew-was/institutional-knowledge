'use client';

import { Button } from '@base-ui/react/button';

interface ClearFlagButtonProps {
  onClick: () => void;
  isLoading: boolean;
  error: string | null;
}

export function ClearFlagButton({
  onClick,
  isLoading,
  error,
}: ClearFlagButtonProps) {
  return (
    <div>
      <Button
        type="button"
        aria-label="Clear flag"
        disabled={isLoading}
        aria-disabled={isLoading}
        onClick={onClick}
      >
        {isLoading ? 'Clearing…' : 'Clear flag'}
      </Button>
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
