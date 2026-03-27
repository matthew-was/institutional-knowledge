'use client';

import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { type Control, Controller, type FieldErrors } from 'react-hook-form';

import type { MetadataEditValues } from '@/components/DocumentMetadataForm/useDocumentMetadata';

interface MetadataEditFieldsProps {
  control: Control<MetadataEditValues>;
  errors: FieldErrors<MetadataEditValues>;
}

export function MetadataEditFields({
  control,
  errors,
}: MetadataEditFieldsProps) {
  return (
    <div>
      <Field.Root invalid={!!errors.date}>
        <Field.Label>Date</Field.Label>
        <Controller
          name="date"
          control={control}
          render={({ field }) => (
            <Input
              id="metadata-date"
              type="date"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.date?.message}</Field.Error>
      </Field.Root>

      <Field.Root invalid={!!errors.description}>
        <Field.Label>Description</Field.Label>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <Field.Control
              render={<textarea />}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.description?.message}</Field.Error>
      </Field.Root>

      <Field.Root invalid={!!errors.documentType}>
        <Field.Label>Document type</Field.Label>
        <Controller
          name="documentType"
          control={control}
          render={({ field }) => (
            <Input
              id="metadata-document-type"
              type="text"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.documentType?.message}</Field.Error>
      </Field.Root>

      {/*
       * Array fields (people, organisations, landReferences) are stored as
       * comma-separated strings in the form. MetadataEditSchema's preprocessor
       * converts them to string[] on submit and passes them through unchanged
       * when already an array (for programmatic pre-population).
       */}
      <Field.Root invalid={!!errors.people}>
        <Field.Label>People (comma-separated)</Field.Label>
        <Controller
          name="people"
          control={control}
          render={({ field }) => (
            <Input
              id="metadata-people"
              type="text"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.people?.message}</Field.Error>
      </Field.Root>

      <Field.Root invalid={!!errors.organisations}>
        <Field.Label>Organisations (comma-separated)</Field.Label>
        <Controller
          name="organisations"
          control={control}
          render={({ field }) => (
            <Input
              id="metadata-organisations"
              type="text"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.organisations?.message}</Field.Error>
      </Field.Root>

      <Field.Root invalid={!!errors.landReferences}>
        <Field.Label>Land references (comma-separated)</Field.Label>
        <Controller
          name="landReferences"
          control={control}
          render={({ field }) => (
            <Input
              id="metadata-land-references"
              type="text"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.landReferences?.message}</Field.Error>
      </Field.Root>
    </div>
  );
}
