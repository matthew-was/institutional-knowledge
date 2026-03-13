/**
 * Zod schemas for ingestion run API contracts.
 *
 * Covers ING-001 through ING-004 as defined in backend-tasks.md (Task 14).
 * ING-001 and ING-002 are also described in integration-lead-contracts.md.
 * ING-003 (addFileToRun) and ING-004 (cleanupRun) are CLI-only endpoints.
 * Schemas will be completed when Task 14 (ingestion handlers) is implemented.
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// ING-001: Create ingestion run
// ---------------------------------------------------------------------------

export const CreateIngestionRunRequest = z
  .object({
    sourceDirectory: z.string().min(1),
    grouped: z.boolean(),
  })
  .openapi('CreateIngestionRunRequest');

export type CreateIngestionRunRequest = z.infer<
  typeof CreateIngestionRunRequest
>;

export const CreateIngestionRunResponse = z
  .object({
    runId: z.uuid(),
    status: z.literal('in_progress'),
  })
  .openapi('CreateIngestionRunResponse');

export type CreateIngestionRunResponse = z.infer<
  typeof CreateIngestionRunResponse
>;

// ---------------------------------------------------------------------------
// ING-002: Complete ingestion run
// ---------------------------------------------------------------------------

export const CompleteIngestionRunResponse = z
  .object({
    runId: z.uuid(),
    status: z.literal('completed'),
    totalSubmitted: z.number().int().nonnegative(),
    totalAccepted: z.number().int().nonnegative(),
    totalRejected: z.number().int().nonnegative(),
  })
  .openapi('CompleteIngestionRunResponse');

export type CompleteIngestionRunResponse = z.infer<
  typeof CompleteIngestionRunResponse
>;

// ---------------------------------------------------------------------------
// ING-003: Add file to ingestion run
// ---------------------------------------------------------------------------

export const AddFileToRunResponse = z
  .object({
    documentId: z.uuid(),
    status: z.literal('uploaded'),
  })
  .openapi('AddFileToRunResponse');

export type AddFileToRunResponse = z.infer<typeof AddFileToRunResponse>;

// ---------------------------------------------------------------------------
// ING-004: Cleanup ingestion run
// ---------------------------------------------------------------------------

export const CleanupRunResponse = z
  .object({
    deleted: z.boolean(),
  })
  .openapi('CleanupRunResponse');

export type CleanupRunResponse = z.infer<typeof CleanupRunResponse>;
