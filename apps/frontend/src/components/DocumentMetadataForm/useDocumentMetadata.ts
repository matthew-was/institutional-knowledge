import { zodResolver } from '@hookform/resolvers/zod';
import type { DocumentDetailResponse } from '@institutional-knowledge/shared';
import { useMemo, useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { MetadataEditSchema } from '@/lib/schemas';

/**
 * The form's internal working representation.
 *
 * Array fields (`people`, `organisations`, `landReferences`) are stored as
 * comma-separated strings in the form so the user can type them naturally.
 * `MetadataEditSchema` preprocesses these strings into `string[]` on submit.
 *
 * `date` is stored as a string: '' for undated documents, 'YYYY-MM-DD' when
 * dated. A null initial date from the API maps to '' so the date input renders
 * empty without triggering a validation error.
 */
export interface MetadataEditValues {
  date: string;
  description: string;
  documentType: string;
  people: string;
  organisations: string;
  landReferences: string;
}

/**
 * Maps a DocumentDetailResponse to the initial form values.
 *
 * Array fields are joined into comma-separated strings for display.
 * Date null → ''.
 */
function toFormValues(document: DocumentDetailResponse): MetadataEditValues {
  return {
    date: document.date ?? '',
    description: document.description,
    documentType: document.documentType ?? '',
    people: document.people.join(', '),
    organisations: document.organisations.join(', '),
    landReferences: document.landReferences.join(', '),
  };
}

export function useDocumentMetadata(document: DocumentDetailResponse) {
  const defaultValues = useMemo(() => toFormValues(document), [document]);

  const {
    control,
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MetadataEditValues>({
    // zodResolver's type parameter is widened by z.preprocess (which uses
    // `unknown` as its input type). The double cast via `unknown` aligns the
    // resolver with the form's explicit working type — the runtime behaviour is
    // correct because the schema's preprocessor accepts the comma-separated
    // string values that the form produces and converts them to arrays.
    resolver: zodResolver(
      MetadataEditSchema,
    ) as unknown as Resolver<MetadataEditValues>,
    mode: 'onBlur',
    defaultValues,
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // TODO Task 11: wire useSWRMutation to PATCH /api/curation/documents/:id/metadata
  async function onSubmit(_data: MetadataEditValues) {
    setServerError(null);
    setSuccessMessage(null);
    // API call wired in Task 11.
  }

  return {
    control,
    errors,
    isSubmitting,
    serverError,
    successMessage,
    handleSubmit: rhfHandleSubmit(onSubmit),
  };
}
