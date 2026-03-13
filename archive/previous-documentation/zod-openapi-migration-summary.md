# Zod → OpenAPI Migration Summary

**Status**: Decision pending — this document supports the ADR process.
**Date**: 2026-03-13
**Recommended over**: oRPC (see `orpc-migration-summary.md` for comparison)
**Scope**: Express backend (`apps/backend/`), shared types (`packages/shared/`),
Python processing service (`services/processing/`)

---

## What this gives us

- Zod schemas in `packages/shared/` become the single source of truth for all API contracts
- An OpenAPI 3.x spec is auto-generated from those schemas at startup (or as a build step)
- Next.js gets a typed fetch client generated from the spec — no raw string URLs or manual types
- Python gets Pydantic models + httpx client generated from the same spec
- Express and all middleware stay exactly as planned — no routing framework change
- Works cleanly with `multer` for multipart file upload (Tasks 8 and 14)

---

## Why this over oRPC

| Concern | Zod → OpenAPI | oRPC |
| --- | --- | --- |
| Express unchanged | Yes | No — router replaced |
| `multer` file upload | Works as-is | Active rough edge in oRPC |
| Python impact | Identical (both generate Pydantic from same spec) | Identical |
| TS client ergonomics | Typed `openapi-fetch` client | Typed oRPC client |
| Pre-1.0 dependency on routing layer | No | Yes |
| Error handler conventions preserved | Yes | Requires mapping to ORPCError |

The TypeScript client ergonomics are comparable. The Python outcome is identical.
The risk profile is lower because Express is not replaced.

---

## Timing

Route handlers are implemented in Tasks 8–19. The schema layer (`apps/backend/src/schemas/`
and `packages/shared/`) is currently a placeholder. **Adding the code-gen pipeline before
Task 8 means every handler is written against generated types from the start** — no retrofit
needed.

---

## New dependencies

```bash
# packages/shared — schema definitions and spec generation
pnpm add zod @asteasolutions/zod-to-openapi

# apps/backend — serve the spec
pnpm add @asteasolutions/zod-to-openapi

# apps/frontend — typed fetch client (added when frontend tasks begin)
pnpm add openapi-fetch
pnpm add -D openapi-typescript

# services/processing — Python code-gen (run once, output committed)
pip install datamodel-code-generator httpx
```

---

## What changes in the backend

### 1. `packages/shared/src/` — new `schemas/` directory

All request and response Zod schemas move to `packages/shared/src/schemas/`. This makes
them importable by both `apps/backend/` (for validation) and `apps/frontend/` (for type
inference). Schemas are grouped by domain — mirrors the route structure in Tasks 8–14.

```text
packages/shared/src/schemas/
├── documents.ts      # Tasks 8–9: DOC-001 to DOC-009
├── vocabulary.ts     # Task 10: VOC-001 to VOC-004
├── processing.ts     # Tasks 11–12: PROC-001 to PROC-002
├── search.ts         # Task 13: QUERY-001 to QUERY-002
├── ingestion.ts      # Task 14: ING-001 to ING-004
└── admin.ts          # Task 15: ADMIN-001 + health check
```

Example — `packages/shared/src/schemas/documents.ts`:

```typescript
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const InitiateUploadRequest = z.object({
  filename: z.string().min(1).openapi({ example: '1987-06-15 - wedding.jpg' }),
  contentType: z.string().min(1).openapi({ example: 'image/jpeg' }),
  fileSizeBytes: z.number().positive().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  description: z.string().min(1),
});

export const InitiateUploadResponse = z.object({
  uploadId: z.uuid(),
  status: z.literal('initiated'),
});

export type InitiateUploadRequest = z.infer<typeof InitiateUploadRequest>;
export type InitiateUploadResponse = z.infer<typeof InitiateUploadResponse>;
```

### 2. `apps/backend/src/openapi.ts` — new spec generator

A single module that imports all schemas from `packages/shared/src/schemas/` and produces
an OpenAPI document. This is registered as a route in `index.ts`.

```typescript
import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  InitiateUploadRequest,
  InitiateUploadResponse,
  // ... all other schemas
} from '@institutional-knowledge/shared/schemas';

const registry = new OpenAPIRegistry();

registry.registerPath({
  method: 'post',
  path: '/api/documents/initiate',
  summary: 'Initiate a document upload (DOC-001)',
  request: { body: { content: { 'application/json': { schema: InitiateUploadRequest } } } },
  responses: { 200: { content: { 'application/json': { schema: InitiateUploadResponse } } } },
});

// ... repeat for all routes

export function generateOpenApiSpec() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: { title: 'Institutional Knowledge API', version: '1' },
    servers: [{ url: '/api' }],
  });
}
```

### 3. `apps/backend/src/index.ts` — add spec endpoint

One new route alongside the existing health check:

```typescript
import { generateOpenApiSpec } from './openapi.js';

// Registered before auth middleware (same as health check)
app.get('/openapi.json', (_req, res) => {
  res.json(generateOpenApiSpec());
});
```

Everything else in `index.ts` is unchanged.

### 4. `apps/backend/src/routes/` — handlers use imported types

Route handlers import request/response types from `packages/shared/src/schemas/` and use
them for Zod `parse`/`safeParse` validation. The handler shape is unchanged from the
current Express pattern — this is not a framework change.

```typescript
import { InitiateUploadRequest } from '@institutional-knowledge/shared/schemas/documents.js';

router.post('/documents/initiate', async (req, res, next) => {
  const result = InitiateUploadRequest.safeParse(req.body);
  if (!result.success) {
    return next({ status: 400, errors: result.error.issues });
  }
  // result.data is fully typed — no casting
  const { filename, contentType, fileSizeBytes, date, description } = result.data;
  // ... handler logic
});
```

### 5. `apps/backend/src/schemas/index.ts` — becomes a re-export stub

The existing placeholder is updated to re-export from `packages/shared/src/schemas/` for
any backend-internal schema use (e.g. internal types not exposed via the API).

---

## What changes in the Python service

### One new build step: generate Pydantic models from the spec

```bash
# Fetch spec from running backend (or use offline export script)
curl http://localhost:3001/openapi.json -o /tmp/ik-openapi.json

# Generate Pydantic v2 models and httpx client
datamodel-codegen \
  --input /tmp/ik-openapi.json \
  --input-file-type openapi \
  --output services/processing/shared/generated/ \
  --output-model-type pydantic_v2.BaseModel \
  --use-annotated
```

The generated output is committed to `services/processing/shared/generated/` and
re-generated whenever the spec changes (i.e. when `packages/shared/src/schemas/` changes).

### Usage in Python

```python
from shared.generated.models import ProcessingResultsRequest, ChunkResult

# Pydantic validates at the boundary — same as today but from generated types
def receive_results(body: dict) -> ProcessingResultsRequest:
    return ProcessingResultsRequest.model_validate(body)
```

---

## What does NOT change

| Thing | Why unchanged |
| --- | --- |
| Express itself | No routing framework change |
| Pino logger + pino-http | Unchanged |
| Auth middleware | Unchanged |
| `multer` (file upload) | Unchanged — Tasks 8, 14 use it as planned |
| Error handler | Unchanged |
| Graceful shutdown | `server.ts` unchanged |
| DB layer, repositories | No relationship to schema layer |
| StorageService, VectorStore, GraphStore | Injected via deps, unchanged |
| Config module | Unchanged |
| Integration test setup | `globalSetup.ts`, `dbCleanup.ts` unchanged |
| vitest config | Unchanged |
| Docker Compose | Unchanged |
| Handler logic in Tasks 8–19 | Unchanged — only the type import source changes |

---

## What changes in documentation

| Document | Change needed |
| --- | --- |
| `documentation/decisions/architecture-decisions.md` | New ADR-048 recording the Zod → OpenAPI decision, rationale, and options considered. References ADR-031 (RPC-style contract) and ADR-047 (ESM). |
| `documentation/tasks/backend-tasks.md` | Add a note to the preamble that request/response schemas live in `packages/shared/src/schemas/` and are imported by handlers. No changes to individual task logic or acceptance criteria. |
| `documentation/tasks/python-tasks.md` | Add a task or sub-step for running `datamodel-codegen` and committing generated models to `services/processing/shared/generated/`. Reference the `/openapi.json` endpoint. |
| `documentation/tasks/integration-lead-contracts.md` | Note that the OpenAPI spec is auto-generated from Zod schemas in `packages/shared/src/schemas/` — the contract IDs (DOC-001 etc.) and HTTP paths are unchanged. |
| `documentation/project/architecture.md` | Update `packages/shared/` row: add Zod schemas as a shared artifact alongside TypeScript types. Note the `/openapi.json` spec endpoint on the backend. |
| `CLAUDE.md` | Update next actionable step to note: add `@asteasolutions/zod-to-openapi` to `packages/shared/` and `apps/backend/` before Task 8. |

---

## Suggested pre-Task-8 steps

1. Raise ADR-048 via the head-of-development agent
2. Add `@asteasolutions/zod-to-openapi` to `packages/shared/` and `apps/backend/`
3. Create `packages/shared/src/schemas/` with the domain schema files (stubs are fine)
4. Add `apps/backend/src/openapi.ts` and the `/openapi.json` route
5. Verify `curl http://localhost:3001/openapi.json` returns a valid spec before Task 8 begins
6. Run `datamodel-codegen` against the spec and commit the initial generated output to
   `services/processing/shared/generated/`
7. From Task 8 onward: every new route adds its schemas to `packages/shared/src/schemas/`
   first, then the handler imports them

---

## Decision needed

Capture as **ADR-048** before Task 8. The ADR should record:

- Decision: Zod schemas in `packages/shared/src/schemas/` as single source of truth;
  OpenAPI spec auto-generated via `zod-to-openapi`; Python Pydantic models generated from
  spec via `datamodel-codegen`
- Rationale: closes the Express-Python contract gap (noted in ADR-032); no transport or
  routing framework change; works with multer; `packages/shared/` is already the home for
  shared TypeScript types
- Options considered: oRPC (stronger TS ergonomics, pre-1.0 risk, multipart friction —
  rejected), gRPC (strongest contract, major transport change — rejected), hand-maintained
  types (current state — no source of truth, runtime mismatch risk)
- Risks: generated Python models must be re-generated when schemas change — managed by
  making it a documented build step

---

## Implementation plan — steps to reach Task 8 readiness

### Overview of document impact

ADR-048 is additive — it does not contradict any existing approved ADR. It adds a new
pattern to the shared package and backend without touching transport, routing, middleware,
or data ownership rules. The cascade is therefore narrow:

| Document | Impact | Current status |
| --- | --- | --- |
| `documentation/decisions/architecture-decisions.md` | ADR-048 added | Approved — must unapprove, add ADR, re-approve |
| `documentation/project/architecture.md` | `packages/shared/` row updated; `/openapi.json` noted | Approved — requires consistency check after ADR-048 |
| `documentation/tasks/backend-tasks.md` | Preamble note added; no task logic changes | No approval status — edit directly |
| `documentation/tasks/python-tasks.md` | New code-gen task or sub-step added | No approval status — edit directly |
| `documentation/tasks/integration-lead-contracts.md` | One-line annotation added | Approved — minor annotation only |
| `documentation/tasks/integration-lead-backend-plan.md` | No change needed | Approved — unchanged |
| `documentation/tasks/senior-developer-frontend-plan.md` | No change needed | Approved — unchanged |
| `documentation/tasks/senior-developer-python-plan.md` | No change needed | Approved — unchanged |
| `documentation/approvals.md` | Audit log entries added at each step | Updated as part of each step |

---

### Step-by-step sequence

#### Step 1 — Head of Development agent: write and approve ADR-048

**Agent**: `head-of-development`

**What it does**: Reads `architecture-decisions.md`, the two migration summary documents,
and the existing ADR-031/ADR-032 cross-references. Writes ADR-048 in the same format as
existing ADRs. Checks that ADR-048 is consistent with all existing ADRs and flags any
contradictions.

**Context to pass**:

- `documentation/decisions/architecture-decisions.md`
- `documentation/decisions/zod-openapi-migration-summary.md`
- `documentation/decisions/orpc-migration-summary.md` (for options considered section)
- `documentation/process/development-principles.md`

**Output**: ADR-048 appended to `documentation/decisions/architecture-decisions.md`.

**Approval action after review**:

1. Unapprove `architecture-decisions.md` in `documentation/approvals.md`
2. Review ADR-048 with developer
3. Re-approve `architecture-decisions.md` in `documentation/approvals.md`
4. Add audit log entries for unapproval and re-approval

Because ADR-048 is additive (no existing ADR contradicted), `architecture.md` and
`system-diagrams.md` can be assessed in Step 2 rather than requiring a full cascade
unapproval now.

---

#### Step 2 — Head of Development agent: update `architecture.md`

**Agent**: `head-of-development`

**What it does**: Reads `architecture.md` and ADR-048. Assesses whether any rows in the
technology or component tables need updating. Expected changes are minimal:

- `packages/shared/` row: add "Zod API schemas" as a shared artifact
- Backend row: note `/openapi.json` spec endpoint
- No component boundaries, data flows, or ownership rules change

**Context to pass**:

- `documentation/project/architecture.md`
- `documentation/decisions/architecture-decisions.md` (with ADR-048 now included)

**Approval action after review**:

1. Unapprove `architecture.md` in `documentation/approvals.md`
2. Review changes with developer
3. Re-approve `architecture.md` in `documentation/approvals.md`
4. Add audit log entries

`system-diagrams.md` does not need updating — no component boxes, boundaries, or data
flows change.

---

#### Step 3 — Developer: update task documents directly

These are working documents with no formal approval status. No agent invocation needed.

**`documentation/tasks/backend-tasks.md`** — add to the Flagged Issues preamble:

> **F-004 — API contract schemas (resolved by ADR-048)**
>
> Request and response schemas for all route handlers (Tasks 8–19) must be defined in
> `packages/shared/src/schemas/` using `@asteasolutions/zod-to-openapi` before the handler
> is written. Handlers import types from `@institutional-knowledge/shared/schemas/[domain]`.
> The backend serves an OpenAPI spec at `/openapi.json` (unauthenticated). Python generates
> Pydantic models from this spec via `datamodel-codegen`.

No changes to individual task descriptions or acceptance criteria.

**`documentation/tasks/python-tasks.md`** — add a new task or sub-step for the code-gen
pipeline before the first Python task that calls Express. Cover:

- Running `datamodel-codegen` against the backend `/openapi.json` spec
- Committing generated output to `services/processing/shared/generated/`
- Documenting when to re-run (whenever `packages/shared/src/schemas/` changes)

**`documentation/tasks/integration-lead-contracts.md`** — add a single annotation after
the approval status block:

> **Schema source of truth (ADR-048)**: All request and response schemas defined in this
> document are implemented as Zod schemas in `packages/shared/src/schemas/`. The backend
> auto-generates an OpenAPI 3.x spec from these schemas at `/openapi.json`. Contract IDs
> (DOC-001 etc.) and HTTP paths are unchanged.

---

#### Step 4 — Platform Engineer agent: add dependencies

**Agent**: `platform-engineer`

**What it does**: Adds the new packages to the correct `package.json` files and verifies
the monorepo builds cleanly. This is a dependency update — within Platform Engineer's
scope per the agent workflow.

**Context to pass**:

- `documentation/decisions/architecture-decisions.md` (with ADR-048)
- `packages/shared/package.json`
- `apps/backend/package.json`

**Changes**:

- `packages/shared/package.json`: add `@asteasolutions/zod-to-openapi`
- `apps/backend/package.json`: add `@asteasolutions/zod-to-openapi`
- `packages/shared/src/schemas/`: create stub schema files (empty exports) for all six
  domain files so TypeScript resolves imports before handlers are written

**Note**: `openapi-fetch` and `openapi-typescript` for the frontend, and `datamodel-
codegen` for Python, are added when those respective tasks begin — not now.

---

#### Step 5 — Implementer agent: scaffold schema and spec modules

**Agent**: `implementer` (backend service)

**What it does**: Creates the initial code scaffolding that Task 8 depends on.

**Context to pass**:

- `documentation/tasks/backend-tasks.md` (with F-004 note)
- `documentation/decisions/architecture-decisions.md` (with ADR-048)
- `documentation/decisions/zod-openapi-migration-summary.md`

**Files to create**:

- `packages/shared/src/schemas/documents.ts` — full schemas for DOC-001 to DOC-009
  (Task 8 and 9 need these immediately; define all document schemas now)
- `packages/shared/src/schemas/vocabulary.ts` — stubs (VOC-001 to VOC-004)
- `packages/shared/src/schemas/processing.ts` — stubs (PROC-001, PROC-002)
- `packages/shared/src/schemas/search.ts` — stubs (QUERY-001, QUERY-002)
- `packages/shared/src/schemas/ingestion.ts` — stubs (ING-001 to ING-004)
- `packages/shared/src/schemas/admin.ts` — stubs (ADMIN-001 + health check)
- `packages/shared/src/schemas/index.ts` — re-exports all domain schemas
- `apps/backend/src/openapi.ts` — spec generator (stubs for unpopulated routes)
- `apps/backend/src/index.ts` — add `/openapi.json` route (unauthenticated, before auth
  middleware, same pattern as `/api/health`)

**Definition of done**: `curl http://localhost:3001/openapi.json` returns a valid OpenAPI
document. TypeScript build passes. Task 8 may begin.

---

### Summary sequence

```text
Step 1: head-of-development  → write ADR-048
        developer             → review → unapprove / re-approve architecture-decisions.md
                                       → audit log entry

Step 2: head-of-development  → update architecture.md for ADR-048
        developer             → review → unapprove / re-approve architecture.md
                                       → audit log entry

Step 3: developer             → add F-004 to backend-tasks.md
                              → add code-gen task to python-tasks.md
                              → annotate integration-lead-contracts.md

Step 4: platform-engineer    → add @asteasolutions/zod-to-openapi to packages/shared
                                                                  and apps/backend
                             → create stub schema files

Step 5: implementer          → scaffold packages/shared/src/schemas/documents.ts (full)
                             → scaffold remaining schema stubs
                             → create apps/backend/src/openapi.ts
                             → add /openapi.json route to apps/backend/src/index.ts

→ Task 8 is ready for work
```
