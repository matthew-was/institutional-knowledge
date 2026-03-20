# Code Review — Backend Service — Task 14: Implement ingestion run handlers (ING-001, ING-002, ING-003, ING-004)

**Date**: 2026-03-20 06:17
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/repositories/ingestionRuns.ts` (new)
- `apps/backend/src/services/ingestion.ts` (new — untracked, see B-001)
- `apps/backend/src/routes/ingestion.ts` (new)
- `apps/backend/src/routes/__tests__/ingestion.integration.test.ts` (new)
- `apps/backend/src/db/repositories/documents.ts` (modified)
- `apps/backend/src/db/index.ts` (modified)
- `apps/backend/src/index.ts` (modified)
- `apps/backend/src/routes/index.ts` (modified)
- `apps/backend/src/server.ts` (modified)
- `packages/shared/src/schemas/ingestion.ts`
- `apps/backend/src/db/tables.ts`
- `apps/backend/src/config/index.ts`
- `apps/backend/src/storage/StorageService.ts`
- `apps/backend/src/db/migrations/20260303000006_create_ingestion_runs.ts`

---

## Acceptance condition

**Condition type**: both

**Automated conditions**:

(a) `createIngestionRun`: performs run-start sweep before creating new run record.
(b) `completeRun`: returns 409 when run not `in_progress`; moves files and updates statuses to `finalized`; calls the summary report writer.
(c) `addFileToRun`: returns 404 when run not found; validates filename naming convention; returns 409 on duplicate hash; creates `documents` row with `ingestion_run_id`.
(d) `cleanupRun`: deletes staging and permanent files and the run record.

**Manual conditions**: see verification instructions below.

**Automated result**: Partially met. The following sub-conditions are covered:

- (a) `POST /api/ingestion/runs — sweeps incomplete runs before creating a new run` seeds an existing incomplete run and verifies it is deleted and a new run is created. Covers the sweep behaviour.
- (b) Two tests: `returns 409 when run is not in_progress` (conflict case); `moves files and updates doc statuses to finalized` (full success path with real staging file and DB assertions on doc status and run status); `writes summary report file` (asserts report file exists and contains correct `runId`). All (b) conditions are covered.
- (c) `returns 404 when run does not exist`; `validates standalone filename naming convention` (422 with `invalid_filename`); `returns 409 when file hash duplicates a finalized document`; `creates a documents row with ingestion_run_id on valid input`. The four sub-conditions of (c) are covered. Grouped filename validation is not tested — see S-002.
- (d) `deletes the run record and non-finalized document records` — asserts `deleted: true`, run gone, document gone. Covers (d).

**Manual condition**: The developer must verify the full lifecycle against a local Express instance. Run:

```bash
pnpm --filter backend build
pnpm --filter backend start
```

Then, using curl or a REST client with header `x-internal-key: <frontendKey>`:

1. `POST /api/ingestion/runs` — body `{ "sourceDirectory": "/path/to/dir", "grouped": false }`. Save the returned `runId`.
2. `POST /api/ingestion/runs/:runId/files` (multipart/form-data) — attach three files named `YYYY-MM-DD - description.jpg` (e.g. `1992-06-15 - letter from bank.jpg`, `1993-03-20 - birth certificate.pdf`, `2001-11-01 - photo album.jpg`). Verify each returns `{ documentId, status: 'uploaded' }`.
3. `POST /api/ingestion/runs/:runId/complete`. Verify response contains `{ status: 'completed', totalSubmitted: 3, totalAccepted: 3, totalRejected: 0 }`.
4. Verify the summary report JSON file appears in `ingestion.reportOutputDirectory` (as configured in `config.json5`) and that all three filenames appear in `report.files`.
5. Verify the three documents exist in the `documents` table with `status = 'finalized'`.

**Manual result**: Pending developer verification.

---

## Findings

### Blocking

#### B-001 — `services/ingestion.ts` is not staged for commit

`apps/backend/src/services/ingestion.ts` appears in `git status` under `Untracked files`, not under `Changes to be committed`. It will not be included in any commit until explicitly staged. This is the central file of the implementation — the routes, repository, and tests are all useless without it.

**What must change**: stage the file before committing (`git add apps/backend/src/services/ingestion.ts`).

---

#### B-002 — `completeRun` writes to two tables without a transaction

`apps/backend/src/services/ingestion.ts`, lines 212–240.

`completeRun` performs the following writes in sequence, with no enclosing `db._knex.transaction()`:

1. `db.ingestionRuns.update(runId, { status: 'moving' })` — writes to `ingestion_runs`
2. `db.documents.updateStoragePath(doc.id, storagePath)` — writes to `documents` (per-doc loop)
3. `db.documents.updateStatus(doc.id, 'stored')` — writes to `documents` (per-doc loop)
4. `db.documents.updateStatus(doc.id, 'finalized')` — writes to `documents` (second loop)
5. `db.ingestionRuns.update(runId, { status: 'completed', completedAt })` — writes to `ingestion_runs`

`development-principles.md` explicitly prohibits: "A service function that writes to two or more tables without wrapping all writes in a single `db._knex.transaction()` block, with `trx` threaded through every repository call."

If `moveStagingToPermanent` throws mid-loop (network failure, disk full), some documents will be in `stored` state with permanent files on disk, and others still `uploaded`. The run will remain in `moving` status. The startup sweep handles `moving` runs — it will clean up those documents on next restart. The data-loss scenario is therefore recoverable, but the inconsistency within a single request violates the explicit prohibition regardless.

All write repository methods used here already accept an optional `trx` parameter (`updateStatus`, `updateStoragePath`, `update`). The `moveStagingToPermanent` call is on the `StorageService` interface — it does not participate in a DB transaction and should remain outside the transaction block but must be orchestrated carefully (e.g. move all files first, then open the transaction to update statuses).

**What must change**: The DB writes (status transitions and storagePath updates) must be wrapped in a `db._knex.transaction()` block with `trx` threaded to every repository call. Storage operations cannot participate in a DB transaction and must be performed outside it — likely before opening the transaction (move all files first, collect results, then commit DB state atomically).

---

#### B-003 — `_cleanupRunById` reads outside the passed transaction, then deletes within it

`apps/backend/src/services/ingestion.ts`, line 118.

`_cleanupRunById(runId, trx)` receives a transaction but the first thing it does is:

```typescript
const docs = await db.ingestionRuns.getDocumentsByRunId(runId);
```

`getDocumentsByRunId` does not accept a `trx` parameter — it reads from the pool connection, not from the caller's transaction. In `cleanupRun` (line 450–453), this matters: the outer transaction calls `db.documents.delete(doc.id, trx)` for each doc fetched by the pool-connection read. Because the FK `ingestion_run_id` in `documents` has `ON DELETE SET NULL`, deleting the run record (`db.ingestionRuns.delete(runId, trx)`) would null-out `ingestion_run_id` on the documents rather than cascade-delete them — so the document deletes must happen first, which they do. No functional breakage here in the happy path.

However, in `runStartSweep` (line 154–161), each incomplete run is cleaned up in its own transaction. The read `getDocumentsByRunId(runId)` happens outside any transaction — but a concurrent request could theoretically insert a new document into the run between the read and the delete-within-transaction. In Phase 1 this is not a real risk (CLI is single-threaded per run), but the pattern is structurally inconsistent with the transaction discipline the project requires.

The deeper issue is a CR-004 concern: `getDocumentsByRunId` in `ingestionRuns.ts` reads from the `documents` table. The comment in the repository file acknowledges this as a "cross-table read" and justifies it as "the ingestion run owns its documents." The read-only cross-domain join is permitted by CR-004 (second rule: "Read-only joins into a neighbouring domain's tables are permitted where the data required is small and incidental to the primary query"). This is acceptable.

The blocking concern is that `getDocumentsByRunId` should accept an optional `trx` parameter so it can participate in the caller's transaction. Without it, the cleanup function cannot guarantee it is operating on a consistent snapshot of the documents associated with the run.

**What must change**: `getDocumentsByRunId` in `ingestionRuns.ts` must accept an optional `trx?: Knex.Transaction` parameter and use `const qb = trx ?? db` internally. `_cleanupRunById` must pass `trx` to the call.

---

### Suggestions

#### S-001 — `completeRun` uses synchronous file I/O in an async service

`apps/backend/src/services/ingestion.ts`, lines 268–271.

```typescript
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
```

Both calls are synchronous and block the Node.js event loop. Everything else in this service is `async`/`await`. Consider using `fs.promises.mkdir` and `fs.promises.writeFile` for consistency and to avoid blocking the event loop during report writing.

---

#### S-002 — Grouped filename validation not covered by an integration test

`apps/backend/src/routes/__tests__/ingestion.integration.test.ts`.

The test for filename naming convention (line 358) uses a standalone run (`grouped: false`) and validates that a bad filename returns 422. The `GROUPED_FILENAME_RE` (`^\d{3}( - .+)?$`) path in `addFileToRun` is not exercised by any test. A grouped run created with `{ grouped: true }` and a file with a non-matching name (e.g. `bad-name.jpg`) would confirm the grouped validation path.

This is a suggestion rather than blocking: the acceptance condition states "validates filename naming convention" and the standalone case is tested. However, the grouped path is a separate branch in the service logic.

---

#### S-003 — Group membership determined by `description.startsWith(groupName)` is fragile

`apps/backend/src/services/ingestion.ts`, lines 371–388.

The group fail-fast check uses `d.description.startsWith(fields.groupName as string)` to determine whether a document belongs to the same group. This relies on the CLI setting `groupName` as the description prefix, which is not enforced by the schema or the insert logic in `addFileToRun` itself — the `description` field is set from `fields.description ?? ''` or from the filename stem, neither of which is guaranteed to start with `groupName`.

The comment (line 377) acknowledges this as a convention: "the CLI passes groupName as the description prefix." If the CLI ever changes this convention, or if a description happens to start with a group name by coincidence, the fail-fast logic will misfire.

This is not a blocking issue for Phase 1 (CLI is under the developer's control), but the logic should be documented more explicitly or, ideally, a separate `groupName` column should be added to the `documents` table in a future task to make group membership explicit and queryable.

---

#### S-004 — `invalid_filename` error type uses 422 but all other run errors use 400/404/409

`apps/backend/src/routes/ingestion.ts`, line 55.

```typescript
invalid_filename: 422,
file_validation_failed: 422,
group_validation_failed: 422,
```

Using 422 Unprocessable Entity is reasonable — the request is well-formed but the content fails business validation. This is consistent with HTTP semantics. However, the rest of the backend (validation rejections from `validate` middleware) returns 400. There is no project-level rule requiring 400 vs 422 for this case, so this is not blocking — just noting the divergence for awareness.

---

## Summary

**Outcome**: Fail

Three blocking findings must be resolved before this task can advance to `reviewed`:

- **B-001**: `services/ingestion.ts` is untracked and must be staged.
- **B-002**: `completeRun` writes to `ingestion_runs` and `documents` across multiple statements without a transaction — violates the explicit prohibition in `development-principles.md`.
- **B-003**: `getDocumentsByRunId` does not accept a `trx` parameter; `_cleanupRunById` reads document rows outside the caller's transaction, breaking transactional consistency of the cleanup operation.

The overall implementation is well-structured: the service/route/repository split is clean, the `ERROR_STATUS` records are correctly typed as exhaustive `Record<ErrorType, number>` maps (CR-006 confirmed), all routes use `validate` middleware at the correct boundary (CR-005 confirmed), the two-tier testing rule is followed with a real-DB integration test file (CR-007 confirmed), `ingestionRuns` is correctly listed in the `DbInstance` type in `development-principles.md`, the `crypto` import is for MD5 hashing (not UUID generation — the prohibition is specifically on `crypto.randomUUID()`, not on hashing), and the `uuid` package is correctly used for ID generation. The three blocking issues are targeted and well-scoped.
