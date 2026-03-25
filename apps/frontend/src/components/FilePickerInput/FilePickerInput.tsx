'use client';

import { Field } from '@base-ui/react/field';
import { type Control, Controller } from 'react-hook-form';

import type { UploadFormValues } from '@/components/DocumentUploadForm/useDocumentUpload';
import type { ParsedFilename } from '@/lib/parseFilename';
import { parseFilename } from '@/lib/parseFilename';

interface FilePickerInputProps {
  acceptedExtensions: string[];
  control: Control<UploadFormValues>;
  error?: string;
  onFileSelect: (file: File, parsed: ParsedFilename | null) => void;
}

export function FilePickerInput({
  acceptedExtensions,
  control,
  error,
  onFileSelect,
}: FilePickerInputProps) {
  return (
    <Field.Root invalid={!!error}>
      <Field.Label htmlFor="file-upload">Select document</Field.Label>
      <Controller
        name="file"
        control={control}
        render={({ field }) => (
          // Plain <input type="file"> — Field.Control is not used here because
          // Base UI's event abstraction does not handle FileList values.
          <input
            id="file-upload"
            type="file"
            accept={acceptedExtensions.join(',')}
            ref={field.ref}
            onBlur={field.onBlur}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              field.onChange(file);

              const lastDot = file.name.lastIndexOf('.');
              const stem =
                lastDot > 0 ? file.name.slice(0, lastDot) : file.name;
              const parsed = parseFilename(stem);

              onFileSelect(file, parsed);
            }}
          />
        )}
      />
      <Field.Error match={true}>{error}</Field.Error>
    </Field.Root>
  );
}
