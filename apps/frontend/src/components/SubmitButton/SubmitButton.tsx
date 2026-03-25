'use client';

import { Button } from '@base-ui/react/button';

interface SubmitButtonProps {
  disabled: boolean;
  submitting: boolean;
}

export function SubmitButton({ disabled, submitting }: SubmitButtonProps) {
  const isDisabled = disabled || submitting;

  return (
    <Button type="submit" disabled={isDisabled} aria-disabled={isDisabled}>
      {submitting ? 'Uploading…' : 'Upload'}
    </Button>
  );
}
