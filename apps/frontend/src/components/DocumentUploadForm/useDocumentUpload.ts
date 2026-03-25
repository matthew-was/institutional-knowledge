'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import type { DuplicateRecord } from '@/components/DuplicateConflictAlert/DuplicateConflictAlert';
import type { ParsedFilename } from '@/lib/parseFilename';
import { createUploadFormSchema } from '@/lib/schemas';

export type UploadFormValues = z.infer<
  ReturnType<typeof createUploadFormSchema>
>;

export function useDocumentUpload(
  maxFileSizeMb: number,
  acceptedExtensions: string[],
) {
  const schema = useMemo(
    () => createUploadFormSchema(maxFileSizeMb, acceptedExtensions),
    [maxFileSizeMb, acceptedExtensions],
  );

  const {
    control,
    handleSubmit: rhfHandleSubmit,
    setValue,
    getValues,
    formState: { errors, isValid, isSubmitting },
  } = useForm<UploadFormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateRecord, setDuplicateRecord] =
    useState<DuplicateRecord | null>(null);

  function handleFileSelect(file: File, parsed: ParsedFilename | null) {
    setServerError(null);
    setDuplicateRecord(null);
    if (parsed !== null) {
      setValue('date', parsed.date ?? '', { shouldValidate: false });
      setValue('description', parsed.description, { shouldValidate: false });
    }
    setValue('file', file, { shouldValidate: false });
  }

  function onSubmit(_data: UploadFormValues) {
    // TODO Task 6: wire API call
  }

  return {
    control,
    errors,
    getValues,
    isValid,
    isSubmitting,
    serverError,
    duplicateRecord,
    handleFileSelect,
    handleSubmit: rhfHandleSubmit(onSubmit),
  };
}
