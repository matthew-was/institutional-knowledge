# Implementation Readiness Review

**Date**: 2026-03-04
**Reviewer**: Automated consistency review (Claude Sonnet 4.6)
**Documents reviewed**:

- `documentation/tasks/frontend-tasks.md`
- `documentation/tasks/python-tasks.md`
- `documentation/tasks/backend-tasks.md`
- `documentation/tasks/senior-developer-frontend-plan.md`
- `documentation/tasks/senior-developer-python-plan.md`
- `documentation/tasks/integration-lead-contracts.md`
- `documentation/tasks/integration-lead-backend-plan.md`
- `documentation/decisions/architecture-decisions.md` (ADR-001 to ADR-047)
- `documentation/project/architecture.md`

---

## Dimension 1 — Plan coverage

### 1.1 Frontend task list vs. senior-developer-frontend-plan

**Finding**: OK

All sections of the frontend plan are accounted for in the 21-task frontend list:

| Plan section | Covered by |
| --- | --- |
| Project scaffolding and custom server | Task 1 |
| Config module (nconf + Zod) | Task 2 |
| Internal API client helper | Task 3 |
| C1 upload — Zod schemas | Task 4 |
| Filename parsing utility | Task 5 |
| App layout, navigation, root redirect | Task 6 |
| Upload form components | Task 7 |
| Upload pages (server-side) | Task 8 |
| Next.js API route — composite upload (DOC-004) | Task 9 |
| Curation document queue components | Task 10 |
| Curation document queue page and API routes | Task 11 |
| Document metadata edit components | Task 12 |
| Curation Zod schemas and metadata API routes | Task 13 |
| Document metadata edit page | Task 14 |
| Vocabulary review queue components | Task 15 |
| Vocabulary review queue page and API routes | Task 16 |
| Manual vocabulary term entry components and schema | Task 17 |
| Manual vocabulary term entry page and API route | Task 18 |
| Pino logging | Task 19 |
| Error handling sweep | Task 20 |
| End-to-end MSW integration test suite | Task 21 |

The `packages/shared/` setup (archive reference derivation function and shared TypeScript types) is referenced in the frontend plan and in backend Task 8 (F-003), but there is no dedicated task in either the frontend or backend list to create it. This is the same gap noted in backend Flagged Issue F-003. See Dimension 5 for scope assessment.

### 1.2 Python task list vs. senior-developer-python-plan

**Finding**: OK

All sections of the Python plan are accounted for. Coverage summary:

| Plan section | Covered by |
| --- | --- |
| Service scaffolding and directory structure | Task 1 |
| Config loading (Dynaconf + Pydantic) | Task 2 |
| HTTP client (shared/http_client.py) | Task 3 |
| Auth middleware (inbound key validation) | Task 4 |
| OCRService interface and adapters (Step 1) | Task 5 |
| OCR extraction step | Task 6 |
| TextQualityScorer (Step 2) | Task 7 |
| PatternMetadataExtractor (Step 3) | Task 8 |
| MetadataCompletenessScorer (Step 4) | Task 9 |
| LLMService interface and OllamaLLMAdapter | Task 10 |
| LLM combined pass step + chunk post-processing (Step 5) | Task 11 |
| EmbeddingService interface and OllamaEmbeddingAdapter | Task 12 |
| QueryRouter interface and PassthroughQueryRouter (C3) | Task 13 |
| Query understanding | Task 14 |
| Embedding generation step (Step 6) | Task 15 |
| Context assembly (C3) | Task 16 |
| Response synthesis (C3) | Task 17 |
| Pipeline orchestrator | Task 18 |
| Query handler (C3) | Task 19 |
| FastAPI route wiring and dependency injection | Task 20 |
| Unit test suite completion sweep | Task 21 |
| C2 pipeline integration tests | Task 22 |
| C3 query integration tests | Task 23 |

The Python plan mentions Ruff for linting and formatting (ADR-046). The Python task list does not include a dedicated Ruff task, and `requirements.txt` scaffolding in Task 1 does not mention `ruff`. This is a minor omission — see Dimension 5.

### 1.3 Backend task list vs. integration-lead-backend-plan

**Finding**: OK

All routes in the backend plan route table are covered:

| Route | Contract | Backend task |
| --- | --- | --- |
| POST /api/documents/initiate | DOC-001 | Task 8 |
| POST /api/documents/:uploadId/upload | DOC-002 | Task 8 |
| POST /api/documents/:uploadId/finalize | DOC-003 | Task 8 |
| DELETE /api/documents/:uploadId | DOC-005 | Task 8 |
| GET /api/documents/:id | DOC-007 | Task 9 |
| PATCH /api/documents/:id/metadata | DOC-009 | Task 9 |
| GET /api/curation/documents | DOC-006 | Task 9 |
| POST /api/documents/:id/clear-flag | DOC-008 | Task 9 |
| GET /api/curation/vocabulary | VOC-001 | Task 10 |
| POST /api/curation/vocabulary/:termId/accept | VOC-002 | Task 10 |
| POST /api/curation/vocabulary/:termId/reject | VOC-003 | Task 10 |
| POST /api/curation/vocabulary/terms | VOC-004 | Task 10 |
| POST /api/processing/trigger | PROC-001 | Task 11 |
| POST /api/processing/results | PROC-002 | Task 12 |
| POST /api/search/vector | QUERY-001 | Task 13 |
| POST /api/search/graph | QUERY-002 | Task 13 |
| POST /api/ingestion/runs | ING-001 | Task 14 |
| POST /api/ingestion/runs/:runId/complete | ING-002 | Task 14 |
| POST /api/ingestion/runs/:runId/files | ING-003 | Task 14 |
| DELETE /api/ingestion/runs/:runId | ING-004 | Task 14 |
| GET /api/health | (internal) | Task 15 |
| POST /api/admin/reindex-embeddings | ADMIN-001 | Task 15 |
| Startup sweeps | ADR-017/ADR-018 | Task 16 |
| Database seed | Backend plan | Task 17 |
| Integration test suite | Backend plan | Task 18 |
| Biome quality gate | ADR-046/ADR-047 | Task 19 |
| StorageService | ADR-008 | Task 5 |
| VectorStore | ADR-033 | Task 6 |
| GraphStore | ADR-037 | Task 7 |

All five middleware components (request logger, auth, Zod validation, route handlers, error handler) are covered in Task 4.

---

## Dimension 2 — Cross-list consistency

### 2.1 DOC-002 endpoint path mismatch

**Finding**: Blocking

Frontend Task 9 states:

> Call Express `PUT /api/documents/:uploadId/file` via `apiClient` to upload the file bytes (DOC-002).

The approved contract (DOC-002) defines:

> `POST /api/documents/:uploadId/upload`

Backend Task 8 correctly implements `POST /api/documents/:uploadId/upload` with `uploadFile` as the handler name. The frontend task uses both the wrong HTTP method (`PUT` instead of `POST`) and the wrong path segment (`/file` instead of `/upload`). If implemented as written in frontend Task 9, the call will fail at the Express router with a 404 (or 405 if path is partial). This is a direct impediment to the upload flow.

**Location**: `frontend-tasks.md`, Task 9, step 3 of the handler description.

### 2.2 ADMIN-001 response body mismatch

**Finding**: Minor

The contracts document (ADMIN-001) defines the response as:

```typescript
interface ReindexEmbeddingsResponse {
  reindexed: boolean;
}
```

Backend Task 15 states the endpoint returns `{ status: 'reindexing' }` immediately. The field name and type differ: the contract uses `reindexed: boolean`; the backend task uses `status: 'reindexing'`. The contracts document also says "Runs `REINDEX INDEX` on the IVFFlat embedding index" (implying it waits), while the backend task says "Return `{ status: 'reindexing' }` immediately". The backend plan note ("returns immediately") differs slightly from the contracts note ("runs `REINDEX INDEX`"). This is a minor inconsistency with no cross-service caller impact (ADMIN-001 is called by the CLI or developer tooling, not by other services at runtime), but the backend implementer must choose one response shape. The contracts document should be treated as authoritative.

### 2.3 `packages/shared/` archive reference — no owning task

**Finding**: Minor

Backend Task 8 explicitly flags (F-003) that the `archiveReference` derivation function must exist in `packages/shared/` before handlers that call it can be compiled. The frontend plan mentions `packages/shared/` as the source of this utility. However, no task in either the frontend or backend list creates `packages/shared/` or implements the archive reference function. Both lists assume it exists.

If `packages/shared/` is set up as part of the monorepo scaffold (which is plausible as part of backend Task 1 or frontend Task 1), this may be fine; however, neither task description explicitly includes it. This dependency should be clarified before implementation begins.

### 2.4 Python HTTP client snake_case-to-camelCase serialisation

**Finding**: OK

Python Task 3 specifies that the HTTP client serialises Python snake_case to camelCase JSON for all Express-bound calls. Backend Tasks 11 and 12 (trigger handler and processing results handler) do not require Python to send snake_case — they define and receive camelCase contract fields. Python Task 18 (orchestrator) delegates serialisation to `http_client.py` as required. The design is internally consistent.

### 2.5 Frontend config key name — `express.internalKey`

**Finding**: OK

Frontend Task 2 defines the config key as `express.internalKey`. The contracts document (OQ-6 resolution) names this `express.internalKey` on the Next.js side (caller column: "Next.js | Express | `express.internalKey`"). Backend Task 3 defines `auth.frontendKey` as the expected key on the Express side. The key matrix in the contracts document is consistent with both task lists.

### 2.6 Auth key `auth.pythonServiceKey` used in backend Task 11

**Finding**: OK

Backend Task 11 correctly uses `auth.pythonServiceKey` when the Express processing loop calls Python `POST /process` (PROC-003). This matches the contracts key matrix (Express → Python = `auth.pythonServiceKey`). Python Task 4 validates this key against `auth.inboundKey`, which also matches the matrix.

### 2.7 VOC-001 response field alignment

**Finding**: OK

The contracts document (VOC-001) defines `VocabularyCandidateItem` with fields including `sourceDocumentDescription` and `sourceDocumentDate`. Frontend Task 15 states that `VocabularyQueueItem` renders "term name, category, confidence score, and source document description." Frontend Task 15 also states the VOC-001 response schema is defined in `schemas.ts`. Backend Task 10 (`getVocabularyQueue`) performs the join to get source document description and date. The field shapes are consistent.

### 2.8 DOC-006 `pipelineStatus` field

**Finding**: Minor

The contracts document (DOC-006) defines `DocumentQueueItem` with a `pipelineStatus: string` field. Frontend Task 10 states the list item displays "document description, date, flag reason, and submitter identity" — it does not mention `pipelineStatus` as a displayed field. Backend Task 9 computes a `pipelineStatus` summary string per the contract. The field is present in both the contract and backend implementation, but the frontend task does not describe displaying it. This is either an intentional omission from the display specification (the field may be present in the data but not shown), or a gap. It does not affect the API contract — the field will be in the response body regardless — but the implementation team should confirm whether `pipelineStatus` needs to be visible in the document queue UI.

---

## Dimension 3 — Contract coverage

All contracts from `integration-lead-contracts.md` are accounted for in the task lists. The table below confirms implementation coverage (at least one implementing task) and verification coverage (at least one test case).

| Contract | Implements | Verifies |
| --- | --- | --- |
| DOC-001 | Backend Task 8 | Backend Task 8 (unit + integration) |
| DOC-002 | Backend Task 8 | Backend Task 8 (unit + integration) |
| DOC-003 | Backend Task 8 | Backend Task 8 (unit + integration) |
| DOC-004 | Frontend Task 9 | Frontend Task 9 (MSW), Frontend Task 21 |
| DOC-005 | Backend Task 8 | Backend Task 8 (unit); Frontend Task 9 (MSW) |
| DOC-006 | Backend Task 9 | Backend Task 9 (unit); Frontend Task 11 (MSW) |
| DOC-007 | Backend Task 9 | Backend Task 9 (unit); Frontend Task 13 (MSW) |
| DOC-008 | Backend Task 9 | Backend Task 9 (unit); Frontend Task 11 (MSW) |
| DOC-009 | Backend Task 9 | Backend Task 9 (unit); Frontend Task 13 (MSW) |
| VOC-001 | Backend Task 10 | Backend Task 10 (unit); Frontend Task 16 (MSW) |
| VOC-002 | Backend Task 10 | Backend Task 10 (unit); Frontend Task 16 (MSW) |
| VOC-003 | Backend Task 10 | Backend Task 10 (unit); Frontend Task 16 (MSW) |
| VOC-004 | Backend Task 10 | Backend Task 10 (unit); Frontend Task 18 (MSW) |
| PROC-001 | Backend Task 11 | Backend Task 11 (unit) |
| PROC-002 | Backend Task 12 | Backend Task 12 (unit + integration) |
| PROC-003 | Python Task 20 (POST /process endpoint) | Python Tasks 20 and 22 |
| QUERY-001 | Backend Task 13 | Backend Task 13 (unit); Python Task 3 (HTTP client test) |
| QUERY-002 | Backend Task 13 | Backend Task 13 (unit) |
| QUERY-003 | Python Task 20 (POST /query endpoint) | Python Tasks 20 and 23 |
| ING-001 | Backend Task 14 | Backend Task 14 (unit + manual) |
| ING-002 | Backend Task 14 | Backend Task 14 (unit + manual) |
| ADMIN-001 | Backend Task 15 | Backend Task 15 (unit + integration) |

**Notable observation on PROC-001**: PROC-001 is callable from either the curation UI or the CLI (per the contracts document). No frontend task implements the processing trigger button or API route. This is consistent with the frontend plan scope, which explicitly covers the curation queue and vocabulary queue but does not list a "trigger processing" button. This is a known scope gap for Phase 1 frontend — the trigger is presumably issued from the CLI in Phase 1. No task is missing; the omission is intentional. This is noted here for completeness.

---

## Dimension 4 — Architecture compliance

### 4.1 ADR-031: Express is sole database writer; Python has no direct database connection

**Finding**: OK

- Python Task 3 (`http_client.py`) routes all database writes through Express via HTTP. The three implemented methods (`post_processing_results`, `vector_search`, `graph_search`) cover all Python-to-Express data flows.
- Python Task 4 (auth middleware) and Task 20 (route wiring) explicitly validate the inbound key and return results without any direct database calls.
- No Python task references a database connection string or a database client library. The `requirements.txt` in Python Task 1 lists `httpx` for HTTP but no PostgreSQL client.
- Backend Tasks 8, 9, 10, 11, 12 implement all write operations exclusively through Knex, with the Knex instance injected as a dependency.

### 4.2 ADR-044: All internal service calls use `x-internal-key` shared-key auth

**Finding**: OK

- Frontend Task 3 (`apiClient.ts`) injects `x-internal-key` on every call to Express. All subsequent frontend tasks (9, 11, 13, 16, 18) use `apiClient` exclusively. Frontend Task 21 asserts the header is present on every Express call.
- Backend Task 4 implements the auth middleware that validates `x-internal-key` against both `auth.frontendKey` and `auth.pythonKey`. The middleware is applied globally. Backend Task 4's acceptance conditions include assertions for both key values and the health-check bypass.
- Python Task 3 (`http_client.py`) injects `auth.expressKey` as `x-internal-key` on every outbound Express call. Python Task 4 validates `auth.inboundKey` on every inbound Python request.
- The health endpoint (`GET /health` for Express, `GET /health` for Python) correctly bypasses auth in both backend Task 4 and Python Task 4.

### 4.3 ADR-045: Next.js proxies C3 queries to Python; Express is not in the C3 query path

**Finding**: OK

- No frontend task implements a route that sends queries to Express for forwarding to Python. The C3 query proxy path (ADR-045) is deferred to Phase 2 in the frontend plan, and the frontend task list correctly makes no Phase 1 provision for it.
- Python Task 19 (`query_handler.py`) calls Express only for vector search callbacks (via `http_client.vector_search`), not through Express as an intermediary. Express remains out of the query orchestration path.
- Backend Task 13 implements the vector and graph search callback endpoints called by Python — Express is in the data retrieval path (correct per ADR-033 and ADR-037) but is not in the query orchestration path (correct per ADR-045).

### 4.4 ADR-047: ESM module format for `apps/frontend/` and `apps/backend/`

**Finding**: Minor (backend); OK (frontend)

- **Frontend**: Frontend Task 1 mentions `server.ts` and TypeScript, and Task 1 scaffolds the project but does not explicitly state that `"type": "module"` must be set in `package.json`. ADR-047 is not referenced by name in any frontend task. This is a minor omission — the implementer may not be aware of the requirement without reading ADR-047 independently.

- **Backend**: Backend Task 1 explicitly flags F-001 (ESM vs. CommonJS decision required before scaffolding). F-001 states "The developer must resolve this — and ideally capture it as ADR-047 — before implementation begins." ADR-047 now exists and resolves this: ESM, `"type": "module"`, `.js` extensions in imports, `import.meta.url` replaces `__dirname`. Backend Task 1 references F-001 but does not incorporate the ADR-047 resolution into the task description. As a result, the implementer must know to read ADR-047 before beginning Task 1 rather than having the requirements in the task itself.

The flagged issue F-001 in backend-tasks.md remains accurate but is now stale — ADR-047 was committed after the backend task list was written. The task should be treated as resolved. This is not blocking since the ADR exists and is the authoritative source, but the task description will not point the implementer to it unless they read the flagged issue carefully.

---

## Dimension 5 — Flagged items

### FLAG-01 (Python tasks): OQ-3 — Embedding model choice

**Assessment**: Correctly scoped — Minor

The Python task list correctly flags that Tasks 15 and 22 cannot be fully closed until the embedding model is chosen and documented in a decision log. The flagged item states the dependency clearly. Task 12 (OllamaEmbeddingAdapter) can be implemented with a placeholder dimension; Task 15 and Task 22 are explicitly blocked pending OQ-3 resolution. The scope is correct; no task is missing. The implementer must create a decision log entry (a lightweight ADR or annotation) before closing Task 15 and Task 22.

### FLAG-02 (Python tasks): OQ-4 — Initial regex patterns and completeness weights

**Assessment**: Correctly scoped — Minor

Task 10 (completeness scorer) can be implemented structurally but the specific weights must be documented before US-040 can be closed. Task 8 (pattern extractor) uses test-specific inline patterns in tests so it is not blocked structurally. The flag is accurate; the scope is correct.

### FLAG-03 (Python tasks): Task 22 requires Ollama and Docling

**Assessment**: Correctly scoped — Minor

The flag is informational. No action is required from the task list — the developer must confirm the local environment before starting Task 22. The condition type for Task 22 is `both` (automated and manual), which correctly reflects the external dependency.

### F-001 (Backend tasks): ESM vs. CommonJS

**Assessment**: Now resolved — Minor

ADR-047 (committed 2026-03-03, per CLAUDE.md) makes this decision: ESM, `"type": "module"`, `.js` import extensions, `import.meta.url`. The backend task list pre-dates this ADR and therefore presents F-001 as an open question requiring a "scaffolding session". The question is now answered. The implementer should read ADR-047 before starting backend Task 1. The flagged issue text in `backend-tasks.md` should ideally be updated to reference ADR-047, but this is not blocking.

### F-002 (Backend tasks): Knex config wiring

**Assessment**: Correctly scoped — Minor

ADR-047 resolves this partially: "Knex is initialised programmatically using values from the nconf config singleton; no `knexfile.js` is used in production or test operation." A `knexfile.ts` may be provided as optional developer tooling. The implementer decision is constrained to whether a `knexfile.ts` is provided as a developer convenience. Not blocking.

### F-003 (Backend tasks): `packages/shared/` archive reference function

**Assessment**: Blocking risk — Minor

No task in either list owns the creation of `packages/shared/` and the archive reference function. Backend Task 8 explicitly states the function must exist before the handler can be implemented, and F-003 flags this gap. The frontend task list implicitly assumes the function is available (the frontend references `archiveReference` in Zod schemas and success display). This gap does not block scaffolding tasks but will block backend Task 8 and the frontend's success flow if not addressed.

This review classifies this as Minor (rather than Blocking) because the fix is simple — a small number of lines in `packages/shared/index.ts` — and the implementation complexity is minimal. However, the developer must explicitly plan this work and not assume either list covers it. Recommended action: add a note to backend Task 1 (or a new Task 0 in the backend list) explicitly creating `packages/shared/` with the archive reference utility as the first deliverable.

### Ruff linter — not mentioned in Python task list

**Assessment**: Minor

ADR-046 states: "The Python service uses Ruff for linting and formatting, consistent with the Python ecosystem." The Python senior developer plan does not mention Ruff. The Python task list does not include a task to configure Ruff or add it to `requirements.txt`. This is a minor quality-gate gap. The backend task list includes an explicit Biome quality gate (Task 19). An equivalent Ruff task (add to requirements, configure `pyproject.toml`, run `ruff check services/processing/` as a pre-task gate) should exist in the Python list. Not blocking for implementation, but the Python code will lack consistent linting enforcement.

### PROC-001 frontend trigger — no Phase 1 task

**Assessment**: Correctly scoped — OK

The frontend plan explicitly defers the processing trigger to Phase 2 UI or CLI operation. The contracts document lists PROC-001's callers as "Next.js API route handler (curation UI button) or CLI". In Phase 1 the CLI path is sufficient. No task is missing.

### `pipelineStatus` display in document queue — ambiguous

**Assessment**: Minor

See Dimension 2.8. Backend Task 9 computes and returns `pipelineStatus` per the DOC-006 contract. Frontend Task 10 does not list it as a displayed field. The implementer should confirm whether this field is displayed in Phase 1. If it is required by the UI (which UR-051/UR-055 suggest, since flag reasons include failing page information), it must be included in the component rendering.

---

## Summary of findings

| Finding | Dimension | Severity |
| --- | --- | --- |
| DOC-002 endpoint path/method mismatch in Frontend Task 9 (`PUT /api/documents/:uploadId/file` vs. `POST /api/documents/:uploadId/upload`) | Cross-list consistency | Blocking |
| ADMIN-001 response body: `{ status: 'reindexing' }` (backend) vs. `{ reindexed: boolean }` (contract) | Cross-list consistency | Minor |
| `packages/shared/` archive reference function — no owning task in any list | Flagged items / Plan coverage | Minor |
| ADR-047 ESM resolution not reflected in frontend Task 1 or backend Task 1 descriptions | Architecture compliance | Minor |
| F-001 (ESM) now stale — ADR-047 exists but backend task text still presents it as open | Flagged items | Minor |
| Ruff linter not included in Python task list or requirements.txt | Plan coverage | Minor |
| `pipelineStatus` field computed by backend but not mentioned as displayed in frontend queue | Cross-list consistency | Minor |

---

## Overall readiness verdict

**Ready with notes**

The three task lists are substantially consistent and collectively cover all approved contracts (DOC, VOC, PROC, QUERY, ING, ADMIN series). Architecture compliance with ADR-031, ADR-044, and ADR-045 is solid throughout. The task structure, dependency ordering, acceptance conditions, and condition types are coherent.

One blocking finding must be resolved before implementation of the upload flow proceeds:

**Blocking item**: Frontend Task 9 references `PUT /api/documents/:uploadId/file` for DOC-002. The approved contract (DOC-002) and backend implementation (backend Task 8) both define `POST /api/documents/:uploadId/upload`. Frontend Task 9 must be corrected to use `POST /api/documents/:uploadId/upload` before the upload route handler is implemented.

The remaining six findings are Minor and can be addressed incrementally:

1. ADMIN-001 response body — the backend implementer should confirm against the contracts document (`{ reindexed: boolean }`) and implement accordingly.
2. `packages/shared/` — the developer must plan this as pre-work before backend Task 8.
3. ADR-047 — the developer must read ADR-047 before backend Task 1; consider annotating backend Task 1 with the resolution.
4. F-001 stale text — informational; no action required to begin implementation.
5. Ruff — add Ruff to Python `requirements.txt` in Task 1 and add a quality-gate task equivalent to backend Task 19.
6. `pipelineStatus` display — the developer should confirm the Phase 1 display requirement before implementing frontend Task 10.
