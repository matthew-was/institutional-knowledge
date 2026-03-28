'use client';

import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import {
  type Control,
  Controller,
  type FieldErrors,
  useFieldArray,
} from 'react-hook-form';

import type { AddTermValues } from '@/components/AddVocabularyTermForm/useAddVocabularyTerm';

interface TermRelationshipsInputProps {
  control: Control<AddTermValues>;
  errors: FieldErrors<AddTermValues>;
}

/**
 * Dynamic list of relationship entries for the AddVocabularyTermForm.
 *
 * Each entry has a targetTermId (UUID of an existing vocabulary term) and a
 * relationshipType (free-text string). Indicative relationship types from
 * ADR-038: owned_by, transferred_to, witnessed_by, adjacent_to, employed_by,
 * referenced_in, performed_by, succeeded_by. Not an exhaustive enumeration.
 *
 * Users can add and remove entries. The component is controlled entirely by the
 * parent form's react-hook-form instance via the injected control prop.
 */
export function TermRelationshipsInput({
  control,
  errors,
}: TermRelationshipsInputProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'relationships',
  });

  function handleAdd() {
    append({ targetTermId: '', relationshipType: '' });
  }

  return (
    <fieldset>
      <legend>Relationships</legend>
      {fields.map((field, index) => {
        const entryErrors = errors.relationships?.[index];

        return (
          <div key={field.id}>
            <Field.Root invalid={!!entryErrors?.targetTermId}>
              <Field.Label htmlFor={`relationships.${index}.targetTermId`}>
                Target term ID
              </Field.Label>
              <Controller
                name={`relationships.${index}.targetTermId`}
                control={control}
                render={({ field: inputField }) => (
                  <Input
                    id={`relationships.${index}.targetTermId`}
                    type="text"
                    value={inputField.value}
                    onChange={inputField.onChange}
                    onBlur={inputField.onBlur}
                    ref={inputField.ref}
                  />
                )}
              />
              <Field.Error match={true}>
                {entryErrors?.targetTermId?.message}
              </Field.Error>
            </Field.Root>

            <Field.Root invalid={!!entryErrors?.relationshipType}>
              <Field.Label htmlFor={`relationships.${index}.relationshipType`}>
                Relationship type
              </Field.Label>
              <Controller
                name={`relationships.${index}.relationshipType`}
                control={control}
                render={({ field: inputField }) => (
                  <Input
                    id={`relationships.${index}.relationshipType`}
                    type="text"
                    value={inputField.value}
                    onChange={inputField.onChange}
                    onBlur={inputField.onBlur}
                    ref={inputField.ref}
                  />
                )}
              />
              <Field.Error match={true}>
                {entryErrors?.relationshipType?.message}
              </Field.Error>
            </Field.Root>

            <Button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove relationship ${index + 1}`}
            >
              Remove
            </Button>
          </div>
        );
      })}

      <Button type="button" onClick={handleAdd}>
        Add relationship
      </Button>
    </fieldset>
  );
}
