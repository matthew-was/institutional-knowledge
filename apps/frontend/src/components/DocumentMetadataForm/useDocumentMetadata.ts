import { zodResolver } from '@hookform/resolvers/zod';
import type {
  DocumentDetailResponse,
  UpdateDocumentMetadataRequest,
} from '@institutional-knowledge/shared';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWRMutation from 'swr/mutation';
import { fetchWrapper } from '@/lib/fetchWrapper';
import { MetadataEditSchema } from '@/lib/schemas';

/**
 * The form's internal working representation.
 *
 * Array fields (`people`, `organisations`, `landReferences`) are stored as
 * comma-separated strings so the user can type them naturally. They are split
 * into `string[]` in `onSubmit` before being sent to the API.
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

function splitCommaString(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function useDocumentMetadata(document: DocumentDetailResponse) {
  const defaultValues = useMemo(() => toFormValues(document), [document]);

  const {
    control,
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MetadataEditValues>({
    resolver: zodResolver(MetadataEditSchema),
    mode: 'onBlur',
    defaultValues,
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mutationKey = `/api/curation/documents/${document.documentId}/metadata`;

  const { trigger, isMutating } = useSWRMutation(
    mutationKey,
    async (
      _key: string,
      { arg }: { arg: UpdateDocumentMetadataRequest },
    ): Promise<void> => {
      const res = await fetchWrapper(mutationKey, {
        method: 'PATCH',
        body: JSON.stringify(arg),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          body.message ?? 'Failed to save changes. Please try again.',
        );
      }
    },
  );

  async function onSubmit(data: MetadataEditValues) {
    setServerError(null);
    setSuccessMessage(null);

    // HTML form fields deliver array values as comma-separated strings.
    // Split them into arrays here before sending to the API.
    const patch: UpdateDocumentMetadataRequest = {
      ...data,
      people: splitCommaString(data.people),
      organisations: splitCommaString(data.organisations),
      landReferences: splitCommaString(data.landReferences),
    };

    await trigger(patch).then(
      () => {
        setSuccessMessage('Changes saved successfully.');
      },
      (err: unknown) => {
        setServerError(
          err instanceof Error
            ? err.message
            : 'Failed to save changes. Please try again.',
        );
      },
    );
  }

  return {
    control,
    errors,
    isSubmitting: isSubmitting || isMutating,
    serverError,
    successMessage,
    handleSubmit: rhfHandleSubmit(onSubmit),
  };
}
