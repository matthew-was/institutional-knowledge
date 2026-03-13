/**
 * Zod schemas for admin and health check API contracts.
 *
 * Covers ADMIN-001 (rebuild embedding index) and the health check endpoint
 * as defined in integration-lead-contracts.md.
 * Schemas will be completed when Task 15 (admin handlers) is implemented.
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Health check (GET /api/health)
// ---------------------------------------------------------------------------

export const HealthCheckResponse = z
  .object({
    status: z.literal('ok'),
    timestamp: z.string().openapi({ example: '2026-03-13T10:00:00.000Z' }),
  })
  .openapi('HealthCheckResponse');

export type HealthCheckResponse = z.infer<typeof HealthCheckResponse>;

// ---------------------------------------------------------------------------
// ADMIN-001: Rebuild embedding index
// ---------------------------------------------------------------------------

export const ReindexEmbeddingsResponse = z
  .object({
    reindexed: z.boolean().openapi({ example: true }),
  })
  .openapi('ReindexEmbeddingsResponse');

export type ReindexEmbeddingsResponse = z.infer<
  typeof ReindexEmbeddingsResponse
>;
