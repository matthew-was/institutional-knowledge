/**
 * Barrel re-export for all domain schema modules.
 *
 * Import from this barrel when you need multiple domains, or import directly
 * from the domain file for a single domain (e.g. for handler-level imports).
 *
 * All schemas use @asteasolutions/zod-to-openapi and are the source of truth
 * for the OpenAPI spec generated at /openapi.json (ADR-048).
 */

export * from './admin.js';
export * from './documents.js';
export * from './ingestion.js';
export * from './processing.js';
export * from './search.js';
export * from './vocabulary.js';
