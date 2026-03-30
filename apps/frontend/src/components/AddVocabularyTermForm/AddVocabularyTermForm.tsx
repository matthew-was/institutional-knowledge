'use client';

import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { Controller } from 'react-hook-form';

import { TermRelationshipsInput } from '@/components/TermRelationshipsInput/TermRelationshipsInput';
import { useAddVocabularyTerm } from './useAddVocabularyTerm';

/**
 * Form for manually entering a new vocabulary term (US-062, UR-089).
 *
 * Fields:
 * - term name (string, required)
 * - category (free-text string, required)
 * - description (string, optional)
 * - aliases (comma-separated string, optional — split to string[] on submit)
 * - relationships via TermRelationshipsInput (optional)
 *
 */
export function AddVocabularyTermForm() {
  const {
    control,
    errors,
    isSubmitting,
    serverError,
    successMessage,
    handleSubmit,
  } = useAddVocabularyTerm();

  return (
    <form noValidate onSubmit={handleSubmit}>
      <Field.Root invalid={!!errors.term}>
        <Field.Label>Term name</Field.Label>
        <Controller
          name="term"
          control={control}
          render={({ field }) => (
            <Input
              id="term-name"
              type="text"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.term?.message}</Field.Error>
      </Field.Root>

      <Field.Root invalid={!!errors.category}>
        <Field.Label>Category</Field.Label>
        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <Input
              id="term-category"
              type="text"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.category?.message}</Field.Error>
      </Field.Root>

      <Field.Root invalid={!!errors.description}>
        <Field.Label>Description</Field.Label>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <Field.Control
              render={<textarea />}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.description?.message}</Field.Error>
      </Field.Root>

      <Field.Root invalid={!!errors.aliases}>
        <Field.Label>Aliases (comma-separated)</Field.Label>
        <Controller
          name="aliases"
          control={control}
          render={({ field }) => (
            <Input
              id="term-aliases"
              type="text"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.aliases?.message}</Field.Error>
      </Field.Root>

      <TermRelationshipsInput control={control} errors={errors} />

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
        {isSubmitting ? 'Saving…' : 'Add term'}
      </Button>
    </form>
  );
}
