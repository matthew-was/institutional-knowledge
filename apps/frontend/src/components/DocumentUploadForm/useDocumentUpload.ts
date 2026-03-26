'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWRMutation from 'swr/mutation';
import type { z } from 'zod';

import type { DuplicateRecord } from '@/components/DuplicateConflictAlert/DuplicateConflictAlert';
import { fetchWrapper } from '@/lib/fetchWrapper';
import type { ParsedFilename } from '@/lib/parseFilename';
import { createUploadFormSchema } from '@/lib/schemas';

export type UploadFormValues = z.infer<
  ReturnType<typeof createUploadFormSchema>
>;

async function submitUpload(_key: string, { arg }: { arg: FormData }) {
  return fetchWrapper('/api/documents/upload', { method: 'POST', body: arg });
}

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
    formState: { errors, isValid },
  } = useForm<UploadFormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateRecord, setDuplicateRecord] =
    useState<DuplicateRecord | null>(null);

  const router = useRouter();

  const { trigger, isMutating } = useSWRMutation(
    '/api/documents/upload',
    submitUpload,
  );

  function handleFileSelect(file: File, parsed: ParsedFilename | null) {
    setServerError(null);
    setDuplicateRecord(null);
    if (parsed !== null) {
      setValue('date', parsed.date ?? '', { shouldValidate: false });
      setValue('description', parsed.description, { shouldValidate: false });
    }
    setValue('file', file, { shouldValidate: false });
  }

  async function onSubmit(data: UploadFormValues) {
    setServerError(null);
    setDuplicateRecord(null);

    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('date', data.date);
    formData.append('description', data.description);

    const response = await trigger(formData);

    if (response === undefined) {
      return;
    }

    if (response.status === 201) {
      const body = await response.json();
      const params = new URLSearchParams({
        description: body.description,
        date: body.date ?? '',
        archiveReference: body.archiveReference,
      });
      router.push(`/upload/success?${params.toString()}`);
      return;
    }

    if (response.status === 409) {
      const body = await response.json();
      setDuplicateRecord(body.data.existingRecord);
      return;
    }

    const body = await response.json().catch(() => ({}));
    setServerError(
      (body as { message?: string }).message ?? 'An unexpected error occurred.',
    );
  }

  return {
    control,
    errors,
    getValues,
    isValid,
    isSubmitting: isMutating,
    serverError,
    duplicateRecord,
    handleFileSelect,
    handleSubmit: rhfHandleSubmit(onSubmit),
  };
}
