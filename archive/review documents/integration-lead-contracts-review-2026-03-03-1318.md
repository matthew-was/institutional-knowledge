# Integration Lead Review — Contracts Document

## Document reviewed

`documentation/tasks/integration-lead-contracts.md`

## Review date

2026-03-03

---

## Completeness

1. **All 12 frontend API calls covered**: The frontend plan lists 12 API calls (3 upload
   lifecycle, 4 document curation, 4 vocabulary curation, 1 processing trigger). The contracts
   document defines: DOC-001 through DOC-005 (upload, including cleanup), DOC-006 through
   DOC-009 (document curation), VOC-001 through VOC-004 (vocabulary curation), PROC-001
   (processing trigger), plus DOC-004 (browser-facing composite). All 12 are covered.

2. **All 4 Python Express calls covered**: C2-E1 resolved in PROC-003 notes (shared volume
   mount). C2-E2 is PROC-002. C3-E1 is QUERY-001. C3-E2 stub is QUERY-002. All covered.

3. **QUERY-003 added**: The Python query endpoint (POST /query) is defined as QUERY-003. This
   was not flagged in either Senior Developer plan as a "pending contract" because it is a
   Python endpoint, not an Express endpoint. Including it provides a complete contract surface
   for all inter-service boundaries.

4. **All frontend open questions resolved**: OQ-001 through OQ-005 addressed. OQ-005 is
   correctly deferred to Phase 2.

5. **All Python open questions resolved**: OQ-1 resolved via contracts. OQ-6 resolved with
   per-pair key matrix.

6. **All migration outlines present**: Six migration files defined with table structures,
   columns, indexes, and foreign keys. Schema summary table provided.

7. **TypeScript interfaces for all contracts**: Every contract has request and response
   interfaces in TypeScript.

## Consistency

1. **Endpoint paths**: All Express endpoints use `/api/` prefix consistently. Python endpoints
   (`/process`, `/query`, `/health`) do not use the `/api/` prefix, which is correct -- they
   are internal service endpoints, not part of the Express API namespace.

2. **HTTP methods**: GET for reads, POST for mutations and searches, PATCH for partial updates,
   DELETE for cleanup. Consistent throughout.

3. **Type names**: All interface names follow PascalCase convention. Field names in interfaces
   use camelCase consistently. Database column names use snake_case consistently. The mapping
   between the two is implicit but consistent.

4. **UUID v7**: All ID fields described as UUID v7 throughout.

5. **Date format**: ISO 8601 `YYYY-MM-DD` used consistently for date fields.

6. **Auth header**: `x-internal-key` used consistently across all internal service calls.
   Per-pair key matrix is provided in OQ-6 resolution.

## Ambiguity

1. **PROC-002 transaction orchestration**: The contract states Express writes processing
   results atomically. The description of entity deduplication (step 4 in PROC-002 notes) is
   detailed but could be interpreted differently regarding alias handling. Specifically: when
   an extracted entity matches an existing `vocabulary_terms` row, the contract says "append
   alias if new (UR-094)". It should be clarified that the alias appended is the
   `EntityData.name` value (the original non-normalised name from the LLM), not the
   `normalisedName`. **Severity: Low** -- the UR-094 text ("the normalised variant must be
   appended to the aliases list") makes this clear, but the contract could be more explicit.

2. **PROC-003 response shape**: The contract says the response has "same shape as
   `ProcessingResultsRequest`". This is slightly imprecise -- Python returns a Python dataclass
   that maps to the same JSON structure, not a TypeScript interface. The intent is clear but
   the wording could be tighter. **Severity: Low** -- the implementer will use the
   `ProcessingResultsRequest` interface as the schema definition for both sides.

3. **Embedding dimension at migration time**: Migration 004 notes say "N is set at migration
   time from the config value". This means the migration must read the config to determine the
   vector dimension. This is unusual for a Knex migration (which typically has hardcoded
   values) and the implementer needs to know this is intentional. **Severity: Medium** -- the
   implementer may assume a hardcoded dimension. The migration outline should note that the
   dimension must be parameterised, either as a migration argument or by reading the config
   at migration runtime.

4. **IVFFlat index creation timing**: Migration 004 notes that the IVFFlat index should be
   created after initial data load. This is a performance recommendation but the migration
   outline includes it in the migration file. The implementer needs to know whether to create
   the index in the migration (which runs before any data exists) or defer it.
   **Severity: Medium** -- the backend plan should specify whether the index is created in the
   migration with deferred options or via a separate manual step.

5. **DOC-004 error response mapping**: The browser-facing composite endpoint (DOC-004) says
   errors are "proxied from whichever Express step fails". The mapping from Express error codes
   to browser-facing error codes should be explicit. For example, a DOC-002 409 (duplicate)
   should be surfaced as-is, but a DOC-001 validation error and a DOC-002 validation error
   might have overlapping 400 status codes with different meanings. **Severity: Low** -- the
   Next.js handler can inspect the error body to distinguish them, and the frontend plan
   already handles 409/400/422 differently.

## Scope gaps

1. **Startup sweep endpoint**: ADR-017 describes a startup sweep that cleans up incomplete
   uploads. The contracts document does not define this as an endpoint because it is an
   internal Express startup operation, not an API call. This is correct -- it is not an
   inter-service contract. However, the backend plan must include the startup sweep as a
   service-layer concern. **Not a gap in the contracts document; noted for the backend plan.**

2. **Ingestion run endpoints**: The bulk ingestion CLI needs endpoints for creating and
   managing ingestion runs. The contracts document defines DOC-006 for `ingestion_runs` table
   but no explicit CLI-facing endpoints for bulk ingestion. The CLI operates against the same
   Express API; ingestion-specific endpoints (create run, add file to run, complete run) are
   needed. **This is a gap.** The frontend plan explicitly excludes bulk ingestion (CLI-only),
   but the Python plan does not cover it either (it is not Python's responsibility). The
   Express backend must expose ingestion run endpoints for the CLI. These should be added to
   the contracts document or deferred to the backend plan as Express-internal routes that the
   CLI calls.

3. **Health endpoint for Express**: The Python plan defines `GET /health` for the Python
   service. Express should also have a health endpoint. This is not an inter-service contract
   but should be in the backend plan.

## Summary

The contracts document is substantially complete. Two medium-severity ambiguities (embedding
dimension parameterisation and IVFFlat index timing) should be addressed in the backend plan
rather than the contracts document, as they are implementation details. One scope gap (bulk
ingestion CLI endpoints) should be addressed -- either by adding contracts here or by covering
them in the backend plan as Express-owned routes.

**Recommendation**: Proceed to the backend plan. Address the bulk ingestion endpoints and the
two medium-severity ambiguities in the backend plan rather than revising the contracts
document, since these are Express-internal concerns rather than inter-service contracts.
