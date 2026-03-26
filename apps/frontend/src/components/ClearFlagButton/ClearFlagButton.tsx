'use client';

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
      <button
        type="button"
        aria-label="Clear flag"
        disabled={isLoading}
        aria-disabled={isLoading}
        onClick={onClick}
      >
        {isLoading ? 'Clearing…' : 'Clear flag'}
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
