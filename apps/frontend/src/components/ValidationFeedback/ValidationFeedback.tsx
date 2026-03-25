'use client';

import {
  DuplicateConflictAlert,
  type DuplicateRecord,
} from '@/components/DuplicateConflictAlert/DuplicateConflictAlert';

interface ValidationFeedbackProps {
  fieldErrors?: Record<string, string[]>;
  serverError?: string | null;
  duplicateRecord?: DuplicateRecord | null;
}

export function ValidationFeedback({
  fieldErrors,
  serverError,
  duplicateRecord,
}: ValidationFeedbackProps) {
  const hasFieldErrors =
    fieldErrors !== undefined && Object.keys(fieldErrors).length > 0;

  return (
    <div>
      {hasFieldErrors && (
        <ul>
          {Object.entries(fieldErrors ?? {}).map(([field, messages]) =>
            messages.map((msg) => <li key={`${field}-${msg}`}>{msg}</li>),
          )}
        </ul>
      )}
      {serverError != null && <p role="alert">{serverError}</p>}
      {duplicateRecord != null && (
        <DuplicateConflictAlert existingRecord={duplicateRecord} />
      )}
    </div>
  );
}
