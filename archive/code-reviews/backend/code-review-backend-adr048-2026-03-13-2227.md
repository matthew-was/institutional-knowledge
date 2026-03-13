# Code Review — Backend Service — ADR-048: Zod-to-OpenAPI Contract Pipeline

**Date**: 2026-03-13 22:27
**Task status at review**: code_complete (via F-004 flagged issue resolution)
**Files reviewed**:

- `apps/backend/src/index.ts`
- `apps/backend/src/openapi.ts`
- `apps/backend/src/server.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/schemas/documents.ts`
- `packages/shared/src/schemas/vocabulary.ts`
- `packages/shared/src/schemas/processing.ts`
- `packages/shared/src/schemas/search.ts`
- `packages/shared/src/schemas/ingestion.ts`
- `packages/shared/src/schemas/admin.ts`
- `packages/shared/src/index.ts`
- `packages/shared/package.json`
- `apps/backend/Dockerfile`
- `apps/backend/docker-compose.yml`

---

## Task context

This task is recorded as flagged issue **F-004** in `documentation/tasks/backend-tasks.md` rather
than as a numbered task. F-004 is marked resolved by ADR-048. The acceptance condition is
derived from ADR-048 itself: Zod schemas in `packages/shared/src/schemas/` are the single
source of truth for all API contracts; the backend serves an OpenAPI spec at `/openapi.json`
(unauthenticated); all contract IDs (DOC-001 to ADMIN-001) are represented.

---

## Acceptance condition

**Stated in ADR-048**: Zod schemas in `packages/shared/src/schemas/` are the single source of
truth for all API request and response contracts. The Express backend auto-generates an OpenAPI
3.x specification from these schemas via `@asteasolutions/zod-to-openapi` and serves it at
`/openapi.json` (unauthenticated). All contract IDs (DOC-001 to DOC-009, VOC-001 to VOC-004,
PROC-001/002, QUERY-001/002, ING-001 to ING-004, ADMIN-001) must be represented.

**Condition type**: manual

**Result**: Partially met — with two blocking issues

**Verification instructions for the developer**:

Start the backend and verify the spec endpoint is reachable without authentication:

```bash
docker compose -f ./apps/backend/docker-compose.yml up
```

In a separate terminal:

```bash
curl -s http://localhost:4000/openapi.json | python3 -m json.tool | head -40
```

Expected: a valid OpenAPI 3.0 JSON document with `info.title = "Institutional Knowledge API"`.
The response must be returned without supplying an `x-internal-key` header.

Also confirm the spec includes an entry for every contract ID (DOC-001 to ADMIN-001) by
checking the `paths` object in the response.

---

## Findings

### Blocking

**B-001 — `InitiateUploadRequest.date` uses `.nullable()` instead of empty-string union**

File: `packages/shared/src/schemas/documents.ts`, line 33–37

```typescript
date: z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .openapi({ example: '1987-06-15' }),
```

The contracts document (DOC-001, `integration-lead-contracts.md` line 136) specifies the `date`
field as `string` with the value `""` (empty string) for undated documents, not `null`. The
field must accept either a valid YYYY-MM-DD string or an empty string — not `null`. The
`UpdateDocumentMetadataRequest.date` field correctly uses `.or(z.literal(''))` for the same
semantics; `InitiateUploadRequest.date` must be brought into alignment with the contract. A
`null` value at initiation time would fail validation when the handler is implemented, and the
generated Pydantic model would accept `None` where the contract expects `""`.

What must change: replace `.regex(/^\d{4}-\d{2}-\d{2}$/).nullable()` with
`.regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(''))` (optionally `.optional()` if the field may
be absent, but the contracts interface shows it as always present).

---

**B-002 — Path parameter schemas missing from most `registerPath` calls in `openapi.ts`**

File: `apps/backend/src/openapi.ts`

Only DOC-002 (line 114–121) specifies a `request.params` object. The following paths all
contain OpenAPI path template parameters (curly-brace notation) but their `registerPath` calls
include no `params` schema:

| Contract | Path | Missing params |
| --- | --- | --- |
| DOC-003 | `/api/documents/{uploadId}/finalize` | `uploadId` |
| DOC-005 | `/api/documents/{uploadId}` | `uploadId` |
| DOC-007 | `/api/documents/{id}` | `id` |
| DOC-008 | `/api/documents/{id}/clear-flag` | `id` |
| DOC-009 | `/api/documents/{id}/metadata` | `id` |
| VOC-002 | `/api/curation/vocabulary/{termId}/accept` | `termId` |
| VOC-003 | `/api/curation/vocabulary/{termId}/reject` | `termId` |
| ING-002 | `/api/ingestion/runs/{runId}/complete` | `runId` |
| ING-003 | `/api/ingestion/runs/{runId}/files` | `runId` |
| ING-004 | `/api/ingestion/runs/{runId}` | `runId` |

When `@asteasolutions/zod-to-openapi` processes a path with `{param}` template variables but
no corresponding `params` schema, the generated OpenAPI spec either omits the parameter
entirely or produces an incomplete parameter description. Python's `datamodel-codegen` will
not generate typed path parameter accessors for the missing parameters, defeating the purpose
of the code-gen pipeline for these endpoints.

What must change: add a `request: { params: z.object({ ... }) }` to each affected
`registerPath` call, matching the pattern already established for DOC-002. All path parameter
schemas should use `.string().uuid()` with an `.openapi({ description: '...' })` annotation
consistent with the DOC-002 pattern.

---

### Suggestions

**S-001 — `extendZodWithOpenApi(z)` call in `openapi.ts` is redundant**

File: `apps/backend/src/openapi.ts`, lines 22–25

The call to `extendZodWithOpenApi(z)` at line 25 is redundant. In ESM, all static `import`
statements are hoisted and the imported modules are fully evaluated before any code in the
importing module runs. Because each schema module (e.g. `documents.ts`, `admin.ts`) calls
`extendZodWithOpenApi(z)` at its own module level, `extendZodWithOpenApi` has already been
called via those schema modules before line 25 executes. The comment above the call (lines
22–24) explains the intent but is slightly misleading — the inline `z.object()` schemas
defined in `registerPath` calls are only constructed when those calls execute, at which point
`extendZodWithOpenApi` is already active. The redundant call is harmless but the comment
creates a false impression about module loading order.

Suggestion: remove the `extendZodWithOpenApi(z)` call from `openapi.ts` and update the comment
to explain that each schema module is responsible for extending Zod within its own module
boundary.

---

**S-002 — `DuplicateConflictResponse` (409) not registered as a response for DOC-002**

File: `apps/backend/src/openapi.ts`, lines 110–128

The DOC-002 `registerPath` call lists only a `200` response. The contracts document explicitly
defines a `409` response for DOC-002 with a `DuplicateConflictResponse` body (the schema is
already exported from `documents.ts`). Including the 409 response makes the spec accurate and
allows Python to generate a typed handler for the duplicate-detected case.

Suggestion: add a `409` response entry to the DOC-002 registry entry, referencing
`DuplicateConflictResponse`.

---

**S-003 — No error response codes registered for any path**

File: `apps/backend/src/openapi.ts`, throughout

None of the `registerPath` calls document error responses (400, 401, 404, 409, 422, 500).
The contracts document defines error responses for most contracts. Including them makes the
spec a complete contract document and allows downstream tooling (e.g. `datamodel-codegen`) to
generate typed error response models for Python.

This is not blocking because the primary purpose of the spec (generating request/response
Pydantic models) is served by the 200/201 responses. Adding error responses would improve
completeness.

Suggestion: where contracts define specific error response shapes (e.g. `DuplicateConflictResponse`
for DOC-002 409), add them. Generic 400/401/404 responses without typed bodies can be added as
description-only entries if desired.

---

**S-004 — `devdeps` Dockerfile stage comment in `docker-compose.yml` is stale**

File: `apps/backend/Dockerfile`, line 30
File: `apps/backend/docker-compose.yml`, line 39

The Dockerfile comment on line 30 correctly says the `devdeps` stage "extends deps with a
built `packages/shared`." The `docker-compose.yml` comment on line 39 says "Builds only up
to the deps stage (dependencies installed, no compiled output)." The docker-compose comment is
now stale — the target has been updated to `devdeps` which does compile `packages/shared`.
The comment should be updated to reflect that `devdeps` is the target and that `packages/shared`
is pre-compiled.

Suggestion: update the `docker-compose.yml` comment at line 39 from "deps stage" to "devdeps
stage" and note that `packages/shared` is pre-built so sub-path exports resolve correctly
under `tsx watch`.

---

**S-005 — `@asteasolutions/zod-to-openapi` is a runtime dependency but is used only for spec generation**

File: `apps/backend/package.json`, `packages/shared/package.json`

The `@asteasolutions/zod-to-openapi` package is a build-time code-gen tool. Adding it as a
runtime `dependency` in `apps/backend/package.json` means it is included in the production
Docker image. The library is only needed to generate the OpenAPI spec at request time
(`generateOpenApiSpec()` in `openapi.ts`), which is called on every `GET /openapi.json`
request. If the spec were pre-generated at build time and served as static JSON, the library
would not need to be a runtime dependency. However, serving it dynamically (regenerated on
each call) keeps the spec current with any runtime schema state and avoids a build step.

This is not blocking because the dynamic generation approach is consistent with ADR-048
("Express auto-generates" the spec). The library's size is modest. The suggestion is to
consider pre-generating the spec at startup time (once, not per-request) and caching the
result in a module-level variable, which avoids regenerating the object graph on every request
while still keeping the library as a runtime dependency.

---

## Summary

**Outcome**: Fail

Two blocking findings must be resolved before the task can advance to `reviewed`:

- **B-001**: `InitiateUploadRequest.date` uses `.nullable()` instead of the empty-string union
  specified in the contracts document (DOC-001). This is a contract mismatch that will produce
  an incorrect Pydantic model.
- **B-002**: Path parameter schemas are missing from ten `registerPath` calls in `openapi.ts`.
  Python code-gen will not generate typed path parameter accessors for the affected endpoints,
  leaving the primary purpose of the ADR-048 pipeline incomplete for those contracts.

The task returns to `in_progress`.
