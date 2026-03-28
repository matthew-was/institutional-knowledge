import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AddTermSchema } from '@/lib/schemas';

/**
 * The form's internal working representation.
 *
 * `aliases` is a comma-separated string in the form; will be split to
 * `string[]` in Task 15. `relationships` is an array managed via
 * useFieldArray in `TermRelationshipsInput`.
 */
export type AddTermValues = AddTermSchema;

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

  async function onSubmit(_data: AddTermValues) {
    setServerError(null);
    setSuccessMessage(null);

    // Stub: Task 15 replaces this block with the real useSWRMutation call.
    setSuccessMessage('Term submitted (stub — API wired in Task 15).');
    reset();
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
