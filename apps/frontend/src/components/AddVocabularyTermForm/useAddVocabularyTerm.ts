import { zodResolver } from '@hookform/resolvers/zod';
import type { AddVocabularyTermRequest } from '@institutional-knowledge/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWRMutation from 'swr/mutation';
import { fetchWrapper } from '@/lib/fetchWrapper';
import { AddTermSchema } from '@/lib/schemas';

/**
 * The form's internal working representation.
 *
 * `aliases` is a comma-separated string in the form; split to `string[]` in
 * onSubmit before sending to the API (same pattern as MetadataEditSchema array
 * fields). `relationships` is an array managed via useFieldArray in
 * `TermRelationshipsInput`.
 */
export type AddTermValues = AddTermSchema;

const ADD_TERM_URL = '/api/curation/vocabulary/terms';

export function useAddVocabularyTerm() {
  const {
    control,
    handleSubmit: rhfHandleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddTermValues>({
    resolver: zodResolver(AddTermSchema),
    mode: 'onBlur',
    defaultValues: {
      term: '',
      category: '',
      description: '',
      aliases: '',
      relationships: [],
    },
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { trigger, isMutating } = useSWRMutation(
    ADD_TERM_URL,
    async (
      _key: string,
      { arg }: { arg: AddVocabularyTermRequest },
    ): Promise<void> => {
      const res = await fetchWrapper(ADD_TERM_URL, {
        method: 'POST',
        body: JSON.stringify(arg),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          body.message ?? 'Failed to add term. Please try again.',
        );
      }
    },
  );

  async function onSubmit(data: AddTermValues) {
    setServerError(null);
    setSuccessMessage(null);

    // Split the comma-separated aliases string into a string[] before posting.
    // Filter empty strings to handle trailing commas or leading/trailing spaces.
    const aliasesArray = data.aliases
      ? data.aliases
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;

    const payload: AddVocabularyTermRequest = {
      term: data.term,
      category: data.category,
      description: data.description,
      aliases: aliasesArray,
      relationships: data.relationships,
    };

    await trigger(payload).then(
      () => {
        setSuccessMessage('Term added successfully.');
        reset();
      },
      (err: unknown) => {
        setServerError(
          err instanceof Error
            ? err.message
            : 'Failed to add term. Please try again.',
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
