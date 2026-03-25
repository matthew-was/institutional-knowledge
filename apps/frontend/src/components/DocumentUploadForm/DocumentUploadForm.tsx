'use client';

import { useState } from 'react';

import type { DuplicateRecord } from '@/components/DuplicateConflictAlert/DuplicateConflictAlert';
import { FilePickerInput } from '@/components/FilePickerInput/FilePickerInput';
import { MetadataFields } from '@/components/MetadataFields/MetadataFields';
import { SubmitButton } from '@/components/SubmitButton/SubmitButton';
import { ValidationFeedback } from '@/components/ValidationFeedback/ValidationFeedback';
import type { ParsedFilename } from '@/lib/parseFilename';
import { createUploadFormSchema } from '@/lib/schemas';

interface DocumentUploadFormProps {
  maxFileSizeMb: number;
  acceptedExtensions: string[];
}

export function DocumentUploadForm({
  maxFileSizeMb,
  acceptedExtensions,
}: DocumentUploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string[]>>(
    {},
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateRecord, setDuplicateRecord] =
    useState<DuplicateRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFileSelect(file: File, parsed: ParsedFilename | null) {
    setSelectedFile(file);
    setClientErrors({});
    setServerError(null);
    setDuplicateRecord(null);
    if (parsed !== null) {
      setDate(parsed.date ?? '');
      setDescription(parsed.description);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const schema = createUploadFormSchema(maxFileSizeMb, acceptedExtensions);
    const result = schema.safeParse({
      file: selectedFile,
      date,
      description,
    });

    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString() ?? 'form';
        errors[field] = [...(errors[field] ?? []), issue.message];
      }
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    setSubmitting(true);

    // TODO Task 6: wire API call
  }

  const hasErrors = Object.keys(clientErrors).length > 0;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FilePickerInput
        acceptedExtensions={acceptedExtensions}
        onFileSelect={handleFileSelect}
      />
      <MetadataFields
        date={date}
        description={description}
        onDateChange={setDate}
        onDescriptionChange={setDescription}
      />
      <ValidationFeedback
        fieldErrors={clientErrors}
        serverError={serverError}
        duplicateRecord={duplicateRecord}
      />
      <SubmitButton disabled={hasErrors} submitting={submitting} />
    </form>
  );
}
