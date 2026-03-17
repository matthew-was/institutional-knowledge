# Code Review — Backend Service — Task 8: Document upload handlers (DOC-001, DOC-002, DOC-003, DOC-005)

**Date**: 2026-03-16 10:51
**Task status at review**: code_complete
**Files reviewed**:

- `packages/shared/src/serviceResult.ts` (new)
- `packages/shared/src/index.ts` (modified)
- `apps/backend/src/db/repositories/documents.ts` (new)
- `apps/backend/src/db/repositories/index.ts` (modified)
- `apps/backend/src/db/index.ts` (modified)
- `apps/backend/src/services/documents.ts` (new)
- `apps/backend/src/routes/documents.ts` (new)
- `apps/backend/src/index.ts` (modified)
- `apps/backend/src/server.ts` (modified)
- `apps/backend/src/routes/index.ts` (modified)
- `apps/backend/src/services/documents.test.ts` (new)
- `apps/backend/src/services/__tests__/documents.integration.test.ts` (new)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (modified)

---

## Acceptance condition

**Restated**: Condition type — `both`.

**Automated part**: Vitest unit tests with mocked Knex, StorageService, and config confirm:

- (a) `initiateUpload`: returns 422 for unsupported extension; returns 422 for over-limit file
  size; returns 400 for whitespace-only description; returns 201 with `uploadId` on valid
  request.
- (b) `uploadFile`: returns 404 when `uploadId` not found; returns 404 when status is not
  `initiated`; returns 409 with `DuplicateConflictResponse` when MD5 matches a finalized
  document; returns 200 with `fileHash` on success.
- (c) `finalizeUpload`: returns 404 when status is not `uploaded`; returns 200 with
  `archiveReference` on success.
- (d) `cleanupUpload`: returns 409 when status is `finalized`; returns 200 with
  `{ deleted: true }` on success; calls `deleteStagingFile` for `uploaded` status and
  `deletePermanentFile` for `stored` status.

Integration test (real database): initiate → upload → finalize full lifecycle completes;
document record reaches `finalized` status; staging file is absent; permanent file exists
at `storage_path`.

**Result**: Met — with one observation noted below.

**Automated checks — unit tests** (`apps/backend/src/services/documents.test.ts`):

The unit tests assert on `ServiceResult` shapes returned by `createDocumentService` directly,
not on Express responses. This is the correct approach for a service that has no Express
imports.

- (a) All four `initiateUpload` conditions covered: `unsupported_extension` (`.exe`),
  `file_too_large` (11 MB against 10 MB limit), `whitespace_description` (`'   '`), and
  success path returning `uploadId` string and `status: 'initiated'`. The task specifies 422
  for extension/size errors and 400 for the description error. The unit test asserts on
  `result.errorType`, not on HTTP status; HTTP status mapping is confirmed correct in
  `ERROR_STATUS` in `routes/documents.ts`. The `initiateUpload` happy path test does not
  confirm `res.status(201)` directly because the test is at the service level — the `201`
  is correctly set in the route layer. This is the intended architecture.

- (b) All four `uploadFile` conditions covered: `not_found` (undefined row), `not_found`
  (non-`initiated` status), `duplicate_detected` with full `DuplicateConflictResponse` shape
  including `archiveReference`, and success returning `fileHash` of 32 hex characters.

- (c) Both `finalizeUpload` conditions covered: `not_found` (status `initiated` instead of
  `uploaded`), success with `archiveReference: '1987-06-15 — Wedding photo'`. An additional
  test confirms the `[undated] — description` form when `date` is null — this goes beyond the
  task's stated condition and is a welcome addition.

- (d) All `cleanupUpload` conditions covered: `not_found` (undefined row), `finalized_document`
  (status `finalized`), success with `deleted: true` for `uploaded` status with
  `deleteStagingFile` verified via spy, `deleteStagingFile` for `initiated` status, and
  `deletePermanentFile` for `stored` status.

**Automated checks — integration test** (`apps/backend/src/services/__tests__/documents.integration.test.ts`):

The integration test covers the full initiate → upload → finalize lifecycle against a real
PostgreSQL database and `LocalStorageService` with temp directories. It verifies:

- DB row at `initiated` status after `initiateUpload`
- Staging file exists at expected path after `uploadFile`
- DB row at `uploaded` status with correct `fileHash` after `uploadFile`
- DB row at `finalized` status with `storagePath` set after `finalizeUpload`
- Staging file absent after `finalizeUpload`
- Permanent file exists at `storagePath`

A second integration test covers `cleanupUpload` deleting an `initiated` document record.

The integration test uses `createTestDb`, `cleanAllTables` in `afterEach`, and `globalSetup`
for schema management — consistent with the established integration test pattern.

**Manual verification required by the developer**:

Run the following commands to confirm there are no TypeScript or lint regressions:

```sh
pnpm --filter backend build
pnpm --filter backend exec biome check src
```

Both commands must complete with no errors. The unit and integration tests must pass:

```sh
pnpm --filter backend test
```

For the integration test, the test database must be running:

```sh
docker compose -f docker-compose.test.yml up -d
```

---

## Findings

### Blocking

None.

### Suggestions

**S-001** — `apps/backend/src/services/documents.ts`, line 231
**Staging file not cleaned up after duplicate detection**

When `uploadFile` detects a duplicate, it has already written the staging file
(`storage.writeStagingFile` is called before `findFinalizedByHash`). The staging file is left
in place when the duplicate error is returned. The caller (the route layer) returns a 409 to
the browser and the session ends. The document row remains at `initiated` status — the browser
is expected to call `DELETE /documents/:uploadId` to clean up, but there is no guarantee this
happens (network failure, client crash).

The backend plan's startup sweep (ADR-017) handles this at server restart: initiated-status
documents are cleaned up. This means the orphaned staging file is eventually removed. The
design choice to write before checking the hash (noted in the code comment) is also intentional
— it allows the file to be available if the hash check is needed for other purposes.

This is not a blocking finding because the startup sweep is the documented cleanup mechanism
and the behaviour is consistent with the plan. Raising it as a suggestion so the developer is
aware the orphaned staging file window exists between duplicate detection and the next server
restart. If the startup sweep is not implemented in a later task before end-to-end testing,
this could accumulate orphaned staging files.

**S-002** — `apps/backend/src/routes/documents.ts`, line 92
**`req.params.uploadId` cast is safe but could use inline comment**

`req.params.uploadId as string` is used in three route handlers (lines 92, 123, 143). The
`as string` cast is safe here because Express guarantees a named route parameter is always a
string when present. The cast is idiomatic Express TypeScript and does not represent a real
risk. Adding inline comments explaining why the cast is safe would improve readability for
future reviewers unfamiliar with this Express behaviour.

**S-003** — `apps/backend/src/services/documents.ts`, line 142
**Extension extraction does not handle filenames with no extension**

`filename.slice(filename.lastIndexOf('.'))` returns the full filename when `.` is not present
(e.g. a file named `makefile` returns `makefile`). In that case the extension check will
correctly reject the file (since `makefile` is not in the accepted list), but the error
message will say `File extension 'makefile' is not in the accepted list` which is misleading
— `makefile` looks like a description, not an extension. This is a minor UX concern; the
validation result (rejection) is still correct.

**S-004** — `apps/backend/src/services/__tests__/documents.integration.test.ts`, line 522
**Integration test reads directly from `db._knex` to verify DB state**

The integration test accesses `db._knex<DocumentRow>('documents').where(...)` to verify
intermediate DB state (e.g. checking `initiated` status after `initiateUpload`, checking
`uploaded` status after `uploadFile`). This is consistent with the established integration
test pattern used in earlier tasks (Task 6). Not blocking, but worth noting that as the
documents repository gains more methods, the test could migrate to using
`db.documents.getById()` for these reads instead of reaching through `_knex`. The current
approach is not wrong.

---

## Summary

**Outcome**: Pass

No blocking findings. Task 8 is ready to advance to `reviewed`.

All acceptance conditions are met — both automated (unit tests covering all seven stated
conditions plus additional coverage) and automated integration test (full lifecycle against
real database). The manual verification step (TypeScript build and Biome check) must be
confirmed by the developer before marking `reviewed`.

Key architectural constraints are all respected:

- `services/documents.ts` has zero Express imports; all HTTP concerns are in the route layer
- `ServiceResult<T, K, E>` with exhaustive `Record<DocumentErrorType, number>` in the route
- `next(err)` reserved for unexpected throws only; business logic errors use `res.json()`
- `duplicate_detected` uses custom `result.errorData` body shape
- All DB access via `db.documents.*`; no `db._knex` in the service
- `fileSizeBytes` cast via `String(fileSizeBytes)` in the repository `updateAfterUpload`
- All imports use `.js` extension (ADR-047 ESM)
- No hardcoded provider names or storage paths in service code
- No document content in logs — only identifiers (`uploadId`, `fileHash`, `storagePath`) and
  status values
