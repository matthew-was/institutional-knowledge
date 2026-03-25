'use client';

interface SubmitButtonProps {
  disabled: boolean;
  submitting: boolean;
}

export function SubmitButton({ disabled, submitting }: SubmitButtonProps) {
  const isDisabled = disabled || submitting;

  return (
    <button type="submit" disabled={isDisabled} aria-disabled={isDisabled}>
      {submitting ? 'Uploading…' : 'Upload'}
    </button>
  );
}
