'use client';

import { Button } from '@base-ui/react/button';
import type { DocumentDetailResponse } from '@institutional-knowledge/shared';
import { MetadataEditFields } from '@/components/MetadataEditFields/MetadataEditFields';
import { useDocumentMetadata } from './useDocumentMetadata';

interface DocumentMetadataFormProps {
  document: DocumentDetailResponse;
}

export function DocumentMetadataForm({ document }: DocumentMetadataFormProps) {
  const {
    control,
    errors,
    isSubmitting,
    serverError,
    successMessage,
    handleSubmit,
  } = useDocumentMetadata(document);

  return (
    <form noValidate onSubmit={handleSubmit}>
      <MetadataEditFields control={control} errors={errors} />

      {serverError != null && <div role="alert">{serverError}</div>}
      {successMessage != null && (
        <div role="status" aria-live="polite">
          {successMessage}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        aria-disabled={isSubmitting}
      >
        {isSubmitting ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
