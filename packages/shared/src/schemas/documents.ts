/**
 * Zod schemas for document-related API contracts.
 *
 * Covers DOC-001 through DOC-009 as defined in integration-lead-contracts.md.
 * These schemas are the source of truth for request and response shapes at the
 * Express API boundary. Route handlers import from this file for Zod validation.
 * The OpenAPI spec is auto-generated from these schemas (ADR-048).
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const DocumentStatus = z.enum(['initiated', 'uploaded', 'stored', 'finalized']);

// ---------------------------------------------------------------------------
// DOC-001: Initiate upload
// ---------------------------------------------------------------------------

export const InitiateUploadRequest = z
  .object({
    filename: z
      .string()
      .min(1)
      .openapi({ example: '1987-06-15 - wedding.jpg' }),
    contentType: z.string().min(1).openapi({ example: 'image/jpeg' }),
    fileSizeBytes: z.number().int().positive().openapi({ example: 204800 }),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .or(z.literal(''))
      .openapi({ example: '1987-06-15' }),
    description: z
      .string()
      .trim()
      .min(1)
      .openapi({ example: 'Wedding photograph' }),
  })
  .openapi('InitiateUploadRequest');

export type InitiateUploadRequest = z.infer<typeof InitiateUploadRequest>;

export const InitiateUploadResponse = z
  .object({
    uploadId: z
      .uuid()
      .openapi({ example: '01927c3a-5b2e-7000-8000-000000000001' }),
    status: z.literal('initiated'),
  })
  .openapi('InitiateUploadResponse');

export type InitiateUploadResponse = z.infer<typeof InitiateUploadResponse>;

// ---------------------------------------------------------------------------
// DOC-002: Upload file bytes
// ---------------------------------------------------------------------------

export const UploadFileResponse = z
  .object({
    uploadId: z
      .uuid()
      .openapi({ example: '01927c3a-5b2e-7000-8000-000000000001' }),
    status: z.literal('uploaded'),
    fileHash: z
      .string()
      .min(1)
      .openapi({ example: 'd41d8cd98f00b204e9800998ecf8427e' }),
  })
  .openapi('UploadFileResponse');

export type UploadFileResponse = z.infer<typeof UploadFileResponse>;

export const DuplicateConflictResponse = z
  .object({
    error: z.literal('duplicate_detected'),
    existingRecord: z.object({
      documentId: z
        .uuid()
        .openapi({ example: '01927c3a-5b2e-7000-8000-000000000002' }),
      description: z.string().openapi({ example: 'Wedding photograph' }),
      date: z.string().openapi({ example: '1987-06-15' }),
      archiveReference: z
        .string()
        .openapi({ example: '1987-06-15 — Wedding photograph' }),
    }),
  })
  .openapi('DuplicateConflictResponse');

export type DuplicateConflictResponse = z.infer<
  typeof DuplicateConflictResponse
>;

// ---------------------------------------------------------------------------
// DOC-003: Finalize upload
// ---------------------------------------------------------------------------

export const FinalizeUploadResponse = z
  .object({
    documentId: z
      .uuid()
      .openapi({ example: '01927c3a-5b2e-7000-8000-000000000001' }),
    description: z.string().openapi({ example: 'Wedding photograph' }),
    date: z.string().openapi({ example: '1987-06-15' }),
    archiveReference: z
      .string()
      .openapi({ example: '1987-06-15 — Wedding photograph' }),
    status: z.literal('finalized'),
  })
  .openapi('FinalizeUploadResponse');

export type FinalizeUploadResponse = z.infer<typeof FinalizeUploadResponse>;

// ---------------------------------------------------------------------------
// DOC-005: Cleanup incomplete upload
// ---------------------------------------------------------------------------

export const CleanupResponse = z
  .object({
    deleted: z.boolean().openapi({ example: true }),
  })
  .openapi('CleanupResponse');

export type CleanupResponse = z.infer<typeof CleanupResponse>;

// ---------------------------------------------------------------------------
// DOC-006: Fetch document queue
// ---------------------------------------------------------------------------

export const DocumentQueueParams = z
  .object({
    page: z.coerce.number().int().positive().optional().openapi({ example: 1 }),
    pageSize: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .openapi({ example: 50 }),
  })
  .openapi('DocumentQueueParams');

export type DocumentQueueParams = z.infer<typeof DocumentQueueParams>;

export const DocumentQueueItem = z
  .object({
    documentId: z
      .uuid()
      .openapi({ example: '01927c3a-5b2e-7000-8000-000000000001' }),
    description: z.string().openapi({ example: 'Wedding photograph' }),
    date: z.string().openapi({ example: '1987-06-15' }),
    archiveReference: z
      .string()
      .openapi({ example: '1987-06-15 — Wedding photograph' }),
    flagReason: z.string().openapi({ example: 'OCR quality below threshold' }),
    flaggedAt: z.string().openapi({ example: '2026-03-13T10:00:00Z' }),
    submitterIdentity: z.string().openapi({ example: 'Primary Archivist' }),
    pipelineStatus: z.string().openapi({ example: 'step_2_failed' }),
  })
  .openapi('DocumentQueueItem');

export type DocumentQueueItem = z.infer<typeof DocumentQueueItem>;

export const DocumentQueueResponse = z
  .object({
    documents: z.array(DocumentQueueItem),
    total: z.number().int().nonnegative().openapi({ example: 12 }),
    page: z.number().int().positive().openapi({ example: 1 }),
    pageSize: z.number().int().positive().openapi({ example: 50 }),
  })
  .openapi('DocumentQueueResponse');

export type DocumentQueueResponse = z.infer<typeof DocumentQueueResponse>;

// ---------------------------------------------------------------------------
// DOC-007: Fetch document detail
// ---------------------------------------------------------------------------

export const DocumentDetailResponse = z
  .object({
    documentId: z
      .uuid()
      .openapi({ example: '01927c3a-5b2e-7000-8000-000000000001' }),
    description: z.string().openapi({ example: 'Wedding photograph' }),
    date: z.string().openapi({ example: '1987-06-15' }),
    archiveReference: z
      .string()
      .openapi({ example: '1987-06-15 — Wedding photograph' }),
    documentType: z.string().nullable().openapi({ example: 'photograph' }),
    people: z
      .array(z.string())
      .openapi({ example: ['Alice Smith', 'Bob Jones'] }),
    organisations: z
      .array(z.string())
      .openapi({ example: ['Estate of John Smith'] }),
    landReferences: z
      .array(z.string())
      .openapi({ example: ['North Field', 'Home Farm'] }),
    submitterIdentity: z.string().openapi({ example: 'Primary Archivist' }),
    status: DocumentStatus,
    flagReason: z.string().nullable().openapi({ example: null }),
    flaggedAt: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-03-13T09:00:00Z' }),
    updatedAt: z.string().openapi({ example: '2026-03-13T09:05:00Z' }),
  })
  .openapi('DocumentDetailResponse');

export type DocumentDetailResponse = z.infer<typeof DocumentDetailResponse>;

// ---------------------------------------------------------------------------
// DOC-008: Clear a flag
// ---------------------------------------------------------------------------

export const ClearFlagResponse = z
  .object({
    documentId: z
      .uuid()
      .openapi({ example: '01927c3a-5b2e-7000-8000-000000000001' }),
    flagCleared: z.boolean().openapi({ example: true }),
  })
  .openapi('ClearFlagResponse');

export type ClearFlagResponse = z.infer<typeof ClearFlagResponse>;

// ---------------------------------------------------------------------------
// DOC-009: Update document metadata
// ---------------------------------------------------------------------------

export const UpdateDocumentMetadataRequest = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .or(z.literal(''))
      .optional()
      .openapi({ example: '1987-06-15' }),
    description: z
      .string()
      .trim()
      .min(1)
      .optional()
      .openapi({ example: 'Wedding photograph (revised)' }),
    documentType: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'photograph' }),
    people: z
      .array(z.string())
      .optional()
      .openapi({ example: ['Alice Smith'] }),
    organisations: z
      .array(z.string())
      .optional()
      .openapi({ example: ['Estate of John Smith'] }),
    landReferences: z
      .array(z.string())
      .optional()
      .openapi({ example: ['North Field'] }),
  })
  .openapi('UpdateDocumentMetadataRequest');

export type UpdateDocumentMetadataRequest = z.infer<
  typeof UpdateDocumentMetadataRequest
>;

export const UpdateDocumentMetadataResponse = z
  .object({
    documentId: z
      .uuid()
      .openapi({ example: '01927c3a-5b2e-7000-8000-000000000001' }),
    description: z
      .string()
      .openapi({ example: 'Wedding photograph (revised)' }),
    date: z.string().openapi({ example: '1987-06-15' }),
    archiveReference: z
      .string()
      .openapi({ example: '1987-06-15 — Wedding photograph (revised)' }),
    documentType: z.string().nullable().openapi({ example: 'photograph' }),
    people: z.array(z.string()).openapi({ example: ['Alice Smith'] }),
    organisations: z
      .array(z.string())
      .openapi({ example: ['Estate of John Smith'] }),
    landReferences: z.array(z.string()).openapi({ example: ['North Field'] }),
    updatedAt: z.string().openapi({ example: '2026-03-13T09:10:00Z' }),
  })
  .openapi('UpdateDocumentMetadataResponse');

export type UpdateDocumentMetadataResponse = z.infer<
  typeof UpdateDocumentMetadataResponse
>;
