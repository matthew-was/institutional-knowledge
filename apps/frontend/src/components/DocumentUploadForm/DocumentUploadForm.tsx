'use client';

import { DuplicateConflictAlert } from '@/components/DuplicateConflictAlert/DuplicateConflictAlert';
import { FilePickerInput } from '@/components/FilePickerInput/FilePickerInput';
import { MetadataFields } from '@/components/MetadataFields/MetadataFields';
import { SubmitButton } from '@/components/SubmitButton/SubmitButton';
import { useDocumentUpload } from './useDocumentUpload';

interface DocumentUploadFormProps {
  maxFileSizeMb: number;
  acceptedExtensions: string[];
}

export function DocumentUploadForm({
  maxFileSizeMb,
  acceptedExtensions,
}: DocumentUploadFormProps) {
  const {
    control,
    errors,
    isValid,
    isSubmitting,
    serverError,
    duplicateRecord,
    handleFileSelect,
    handleSubmit,
  } = useDocumentUpload(maxFileSizeMb, acceptedExtensions);

  return (
    <form noValidate onSubmit={handleSubmit}>
      <FilePickerInput
        acceptedExtensions={acceptedExtensions}
        control={control}
        error={errors.file?.message}
        onFileSelect={handleFileSelect}
      />
      <MetadataFields control={control} errors={errors} />
      {duplicateRecord != null && (
        <DuplicateConflictAlert existingRecord={duplicateRecord} />
      )}
      {serverError != null && <div role="alert">{serverError}</div>}
      <SubmitButton disabled={!isValid} submitting={isSubmitting} />
    </form>
  );
}
