'use client';

import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { type Control, Controller, type FieldErrors } from 'react-hook-form';

import type { UploadFormValues } from '@/components/DocumentUploadForm/useDocumentUpload';

interface MetadataFieldsProps {
  control: Control<UploadFormValues>;
  errors: FieldErrors<UploadFormValues>;
}

export function MetadataFields({ control, errors }: MetadataFieldsProps) {
  return (
    <div>
      <Field.Root invalid={!!errors.date}>
        <Field.Label>Date</Field.Label>
        <Controller
          name="date"
          control={control}
          render={({ field }) => (
            <Input
              id="document-date"
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
            <Input
              id="document-description"
              type="text"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Field.Error match={true}>{errors.description?.message}</Field.Error>
      </Field.Root>
    </div>
  );
}
