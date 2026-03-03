# Integration Lead Backend Plan -- Self-Review

## Document reviewed

`documentation/tasks/integration-lead-backend-plan.md` (Draft -- 2026-03-03)

Reviewed against approved `documentation/tasks/integration-lead-contracts.md`
(Approved -- 2026-03-03, including contracts ING-001, ING-002, and ADMIN-001 added during the
contracts review session).

---

## Completeness

### ISSUE-01: ADMIN-001 endpoint missing from route structure and service layer

**Severity**: Blocking

The contracts document defines ADMIN-001 (`POST /api/admin/reindex-embeddings`) as an
approved contract. The backend plan has no Admin section in its route structure table and no
`reindexEmbeddings` handler in the service layer section. The VectorStore section mentions
IVFFlat index rebuild in passing (line 397-401 of the backend plan, and migration 004 notes
reference it) but the actual route, handler description, and testing approach are absent.

**Required resolution**: Add an Admin section to the route structure table with the ADMIN-001
endpoint. Add a `reindexEmbeddings` handler to the service layer section. Add it to the
testing approach (unit test: mock Knex raw query; integration test: verify REINDEX executes
without error).

---

### ISSUE-02: Ingestion contract ID numbering mismatch with contracts document

**Severity**: Blocking

The contracts document defines two ingestion contracts:

- ING-001: `POST /api/ingestion/runs` (create ingestion run)
- ING-002: `POST /api/ingestion/runs/:runId/complete` (complete ingestion run)

The backend plan defines four ingestion endpoints and assigns different ING IDs:

- ING-001: `POST /api/ingestion/runs` -- matches contracts
- ING-002: `POST /api/ingestion/runs/:runId/files` -- NOT in contracts document
- ING-003: `POST /api/ingestion/runs/:runId/complete` -- contracts calls this ING-002
- ING-004: `DELETE /api/ingestion/runs/:runId` -- NOT in contracts document

The backend plan introduced two additional endpoints (`addFileToRun` and `cleanupRun`) that
are not in the approved contracts. The plan's own notes at lines 51-54 acknowledge these are
"Express-owned routes called directly by the CLI" that were not in the inter-service contracts
document. However, the numbering conflict with ING-002 (contracts says "complete run", backend
plan says "add file to run") will cause confusion for the Implementer and Project Manager.

**Required resolution**: Renumber the backend plan's ingestion endpoints to align with the
contracts document. ING-001 and ING-002 must match contracts. The two additional endpoints
(addFileToRun and cleanupRun) should use ING-003 and ING-004 as backend-plan-only identifiers,
clearly marked as such. Update the route structure table and all service layer references.

---

### ISSUE-03: ING-001 request body discrepancy

**Severity**: Advisory

The contracts document ING-001 request is:

```typescript
interface CreateIngestionRunRequest {
  sourceDirectory: string;
}
```

The backend plan (line 67) specifies the request body as
`{ sourceDirectory: string, grouped: boolean }`, adding a `grouped` field not present in the
approved contract.

The `grouped` flag is architecturally sound (ADR-020 specifies the `--grouped` CLI flag for
virtual document grouping), and the backend needs to know whether the run is grouped to
validate file naming conventions. However, the approved contract does not include this field.

**Required resolution**: Either update the contracts document to add `grouped: boolean` to the
ING-001 request interface (preferred -- the field is needed), or remove it from the backend
plan. The contracts document is the authoritative interface definition; the backend plan must
not add fields to approved contracts without updating the source contract.

---

## Consistency

### ISSUE-04: Migration 003 and migration 006 overlap description

**Severity**: Advisory

The backend plan identifies a migration ordering conflict at lines 553-559 and provides a
resolution (migration 003 creates only `processing_runs`; migration 006 creates
`ingestion_runs` and adds `ingestion_run_id` to `documents`). This resolution is correct and
matches the contracts document migration outlines. However, the backend plan's migration 003
description at line 527 still reads "Adds `ingestion_run_id` column to `documents`", which
contradicts the resolution stated at lines 556-559.

**Required resolution**: Remove the `ingestion_run_id` reference from the migration 003
description (line 527) so the description matches the resolution paragraph and the contracts
document.

---

### ISSUE-05: Python config key reference inconsistency

**Severity**: Advisory

The configuration section lists two keys for Express-to-Python auth:

- `auth.pythonServiceKey` (line 583) -- the key Express uses when calling Python
- `python.internalKey` (line 604) -- described as "alias for `auth.pythonServiceKey`"

The contracts document OQ-6 resolution table shows the caller-side key as
`auth.pythonServiceKey`. Having two config keys that are aliases adds implementation
ambiguity. The Implementer may not know which one to use in the HTTP client.

**Required resolution**: Pick one canonical key name. Recommend keeping `auth.pythonServiceKey`
as the single key and removing `python.internalKey` from the configuration section, or keeping
`python.internalKey` as the operational key and noting it replaces `auth.pythonServiceKey`. Do
not list both as separate config keys.

---

### ISSUE-06: VectorStore.write() signature does not include text or chunk metadata

**Severity**: Advisory

The VectorStore interface `write()` method signature is:

```typescript
write(documentId: string, chunkId: string, embedding: number[]): Promise<void>;
```

But the PgVectorStore implementation description (line 378-380) says it inserts into the
`embeddings` table only, with the `chunks` row already existing. The service layer handler
`receiveProcessingResults` (line 259) says "For each chunk: insert `chunks` row; call
`VectorStore.write()` with chunk ID and embedding."

This is internally consistent (the handler inserts chunks, then calls VectorStore for the
embedding), but the `SearchResult` returned by `search()` includes `text`, `chunkIndex`, and
`tokenCount` -- data that comes from the `chunks` table via JOIN, not from VectorStore's own
write. This means VectorStore is read-coupled to data it did not write.

This is not a bug -- it is a design coupling that is acceptable for the PostgreSQL
implementation where both tables live in the same database. But it should be noted so a future
non-PostgreSQL VectorStore implementation knows it must also have access to chunk text data.

**Required resolution**: No code change needed. Add a note to the VectorStore interface section
stating that `search()` joins chunk metadata from the `chunks` table, and any non-PostgreSQL
implementation must account for this coupling.

---

## Ambiguity

### ISSUE-07: Startup seed logic condition

**Severity**: Advisory

The startup operations section (line 347) says: "Seed data (first run only): Run
`knex seed:run` if vocabulary tables are empty." The condition "if vocabulary tables are empty"
is ambiguous -- does it mean if `vocabulary_terms` has zero rows, or if all three vocabulary
tables (`vocabulary_terms`, `vocabulary_relationships`, `rejected_terms`) have zero rows?

**Required resolution**: Specify the exact condition. Recommend: "Run `knex seed:run` if
`vocabulary_terms` contains zero rows." This is the simplest check and covers the intended
case (first run with no seed data).

---

### ISSUE-08: File delivery mechanism for ingestion addFileToRun

**Severity**: Advisory

The `addFileToRun` handler description (lines 308-315) describes file validation and staging
but does not specify whether the file is sent as multipart/form-data (like DOC-002) or by
filesystem path (like PROC-003). Since the CLI runs on the same machine as Express in Phase 1,
either approach works, but the Implementer needs to know which one.

Given that the web UI upload (DOC-002) uses multipart/form-data, and the CLI is expected to
use the same Express endpoints for document creation (per ING-001 notes: "passed as context on
each individual document upload (DOC-001 through DOC-003)"), the CLI likely calls DOC-001
through DOC-003 per file rather than using a separate `addFileToRun` endpoint.

**Required resolution**: Clarify whether the CLI uses DOC-001/DOC-002/DOC-003 per file (with
ingestion_run_id as additional context) or the separate `addFileToRun` endpoint. If the CLI
reuses DOC-001 through DOC-003, then `addFileToRun` may be unnecessary. If `addFileToRun` is a
distinct endpoint, specify the request format (multipart or path reference).

---

## Scope gaps

### ISSUE-09: No contract or handler for fetching ingestion run status

**Severity**: Advisory

The CLI needs to know whether the previous ingestion run completed successfully (for the
run-start sweep). The contracts document ING-001 notes say Express enforces a single active
ingestion run at a time, and the startup sweep detects incomplete prior runs. But there is no
endpoint for the CLI to check run status before calling ING-002 (complete). If the CLI
crashes after submitting all files but before calling complete, restarting the CLI would need
to either resume the run or know to abandon it.

The startup sweep handles this at Express level (incomplete runs are cleaned up on restart),
but the CLI itself has no way to query run state. This may be acceptable for Phase 1 (single
user, local system), but should be noted.

**Required resolution**: No blocking change needed. Note as a Phase 2 consideration: a
`GET /api/ingestion/runs/:runId` status check endpoint would allow the CLI to resume
interrupted runs rather than relying solely on the startup sweep to clean them up.

---

### ISSUE-10: Processing trigger handler description mixes sync and async logic

**Severity**: Advisory

The `triggerProcessing` handler description (lines 236-245) says it queries documents, creates
a processing run record, calls Python per document, receives responses, and writes results.
Then line 245 says "This runs asynchronously after the initial response is returned." But the
handler description up to that point reads as synchronous sequential logic.

The Implementer needs clarity on where the async boundary is: does the handler return the
`TriggerProcessingResponse` (with `runId` and `documentsQueued`) immediately after creating
the run record, and then a separate async process handles the per-document Python calls? Or
does the handler itself run asynchronously?

**Required resolution**: Rewrite the handler description to clearly separate the synchronous
part (create run, count documents, return response) from the asynchronous part (per-document
processing loop). Specify the mechanism (e.g. a detached async function, a worker, or
`setImmediate` / `process.nextTick` to defer the loop).

---

## Summary

| ID | Severity | Category | Status |
| --- | --- | --- | --- |
| ISSUE-01 | Blocking | Completeness | Open |
| ISSUE-02 | Blocking | Completeness | Open |
| ISSUE-03 | Advisory | Completeness | Open |
| ISSUE-04 | Advisory | Consistency | Open |
| ISSUE-05 | Advisory | Consistency | Open |
| ISSUE-06 | Advisory | Consistency | Open |
| ISSUE-07 | Advisory | Ambiguity | Open |
| ISSUE-08 | Advisory | Ambiguity | Open |
| ISSUE-09 | Advisory | Scope gaps | Open |
| ISSUE-10 | Advisory | Ambiguity | Open |

Two blocking issues must be resolved before the backend plan can be approved. Eight advisory
issues should be addressed for clarity and implementer confidence.
