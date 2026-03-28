/**
 * Frontend-only form validation schemas.
 *
 * Only UploadFormSchema, MetadataEditSchema, and AddTermSchema are defined here.
 * All response schemas are imported from @institutional-knowledge/shared.
 */

import { AddVocabularyTermRequest } from '@institutional-knowledge/shared';
import { z } from 'zod';
import { Temporal } from './temporal';

// ---------------------------------------------------------------------------
// UploadFormSchema
// ---------------------------------------------------------------------------

/**
 * Factory function so the schema can be constructed with runtime config values
 * (maxFileSizeMb, acceptedExtensions) without requiring config access in tests.
 */
export function createUploadFormSchema(
  maxFileSizeMb: number,
  acceptedExtensions: string[],
) {
  const maxBytes = maxFileSizeMb * 1024 * 1024;
  const normalised = acceptedExtensions.map((e) => e.toLowerCase());

  return z.object({
    file: z
      .instanceof(File)
      .refine(
        (f) => {
          const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
          return normalised.includes(`.${ext}`);
        },
        {
          message: `File extension must be one of: ${acceptedExtensions.join(', ')}`,
        },
      )
      .refine((f) => f.size <= maxBytes, {
        message: `File size must not exceed ${maxFileSizeMb} MB`,
      }),

    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'Date must be in YYYY-MM-DD format',
      })
      .refine(
        (d) => {
          try {
            Temporal.PlainDate.from(d);
            return true;
          } catch {
            return false;
          }
        },
        { message: 'Date is not a valid calendar date' },
      ),

    description: z
      .string()
      .min(1, { message: 'Description is required' })
      .refine((s) => s.trim().length > 0, {
        message: 'Description must not be whitespace only',
      }),
  });
}

export type UploadFormSchema = ReturnType<typeof createUploadFormSchema>;

// ---------------------------------------------------------------------------
// MetadataEditSchema
// ---------------------------------------------------------------------------

/**
 * Validates the metadata edit form's working representation.
 *
 * Array fields (people, organisations, landReferences) are kept as
 * comma-separated strings here — splitting into string[] happens in onSubmit
 * before the value is sent to the API.
 *
 * Date is optional; null or empty string are both valid (undated document).
 * Description must be non-empty non-whitespace-only if provided.
 */
export const MetadataEditSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal('')),
  description: z.string().trim().min(1),
  documentType: z.string(),
  people: z.string(),
  organisations: z.string(),
  landReferences: z.string(),
});

export type MetadataEditSchema = z.infer<typeof MetadataEditSchema>;

// ---------------------------------------------------------------------------
// AddTermSchema
// ---------------------------------------------------------------------------

/**
 * Derived from the shared AddVocabularyTermRequest schema.
 *
 * Overrides:
 * - `aliases`: kept as a comma-separated string in the form's working
 *   representation (split to string[] in onSubmit before sending to the API,
 *   following the MetadataEditSchema pattern for array fields).
 * - `relationships.targetTermId`: validated as a UUID (Zod v4 form).
 */
export const AddTermSchema = AddVocabularyTermRequest.extend({
  aliases: z.string().optional(),
  relationships: z
    .array(
      z.object({
        targetTermId: z.uuid(),
        relationshipType: z.string().min(1),
      }),
    )
    .optional(),
});

export type AddTermSchema = z.infer<typeof AddTermSchema>;
