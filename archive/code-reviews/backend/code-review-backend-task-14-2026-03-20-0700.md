# Code Review — Backend Service — Task 14: Implement ingestion run handlers (ING-001, ING-002, ING-003, ING-004)

**Date**: 2026-03-20 07:00
**Round**: 2 (re-review after B-002, B-003, S-001, S-002, S-004 fixes)
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/repositories/ingestionRuns.ts`
- `apps/backend/src/services/ingestion.ts`
- `apps/backend/src/routes/ingestion.ts`
- `apps/backend/src/routes/__tests__/ingestion.integration.test.ts`
- `apps/backend/src/db/repositories/documents.ts`

---

## Round 1 findings — verification status

Before assessing the current state, each finding from the first review is confirmed
resolved or still outstanding.

| Finding | Status |
| --- | --- |
| B-001 — `services/ingestion.ts` not staged | Resolved. File is now staged under `Changes to be committed`. |
| B-002 — `completeRun` writes without a transaction | Resolved — see detailed check below. |
| B-003 — `getDocumentsByRunId` no `trx` param | Resolved — see detailed check below. |
| S-001 — synchronous file I/O in `completeRun` | Resolved. `fs.mkdir` / `fs.writeFile` via `node:fs/promises` (async). |
| S-002 — grouped filename validation not tested | Resolved. New test added — see acceptance condition below. |
| S-003 — group membership by `description.startsWith` | Not changed (suggestion; developer chose not to act). Acknowledged. |
| S-004 — missing-file guard status code | Resolved. Guard now returns 400. |

---

## Acceptance condition

**Condition type**: both

**Automated conditions**:

(a) `createIngestionRun`: performs run-start sweep before creating new run record.
(b) `completeRun`: returns 409 when run not `in_progress`; moves files and updates statuses
to `finalized`; calls the summary report writer.
(c) `addFileToRun`: returns 404 when run not found; validates filename naming convention;
returns 409 on duplicate hash; creates `documents` row with `ingestion_run_id`.
(d) `cleanupRun`: deletes staging and permanent files and the run record.

**Result**: Met.

- (a) `sweeps incomplete runs before creating a new run` — seeds an existing incomplete run,
  calls `POST /api/ingestion/runs`, asserts old run deleted and new run created. Covers sweep
  behaviour. Validation rejection (`sourceDirectory` missing → 400) is also exercised.
- (b) Three tests: `returns 409 when run is not in_progress` (conflict case); `moves files and
  updates doc statuses to finalized` (real staging file; asserts `doc.status === 'finalized'`
  and `run.status === 'completed'`); `writes summary report file to reportOutputDirectory`
  (asserts file exists and `parsed.runId` correct). All (b) conditions covered.
- (c) Four tests covering the four sub-conditions: 404 on unknown run; 422 with
  `invalid_filename` for standalone bad name; 422 with `invalid_filename` for grouped bad name
  (`{ grouped: true }` run, filename `bad-name.jpg` vs `GROUPED_FILENAME_RE`); 409 with
  `duplicate_detected`; 201 with `documents` row created and `ingestionRunId` set. All
  (c) conditions covered.
- (d) `deletes the run record and non-finalized document records` — asserts `deleted: true`,
  run absent, document absent after real staging file is written. Covers (d).

**Manual condition**: The developer must verify the full CLI lifecycle against a local Express
instance. Steps:

```bash
pnpm --filter backend build
pnpm --filter backend start
```

Using curl or a REST client with header `x-internal-key: <frontendKey from config>`:

1. `POST /api/ingestion/runs` body `{ "sourceDirectory": "/path/to/dir", "grouped": false }`.
   Save the returned `runId`.
2. `POST /api/ingestion/runs/:runId/files` (multipart/form-data) three times, attaching files
   named `1992-06-15 - letter from bank.jpg`, `1993-03-20 - birth certificate.pdf`,
   `2001-11-01 - photo album.jpg`. Verify each returns
   `{ "documentId": "<uuid>", "status": "uploaded" }`.
3. `POST /api/ingestion/runs/:runId/complete`. Verify response:
   `{ "status": "completed", "totalSubmitted": 3, "totalAccepted": 3, "totalRejected": 0 }`.
4. Verify the summary report JSON appears in `ingestion.reportOutputDirectory` and contains
   all three filenames in `report.files`.
5. Verify the three documents in the `documents` table have `status = 'finalized'` and a
   non-null `storagePath`.

**Manual result**: Pending developer verification.

---

## Findings

### Blocking

None.

### Suggestions

#### S-005 — `getNonFinalizedByRunId` in `documents.ts` is dead code

`apps/backend/src/db/repositories/documents.ts`, lines 114–118.

`getNonFinalizedByRunId` is defined on the documents repository but is not called anywhere in
the codebase. The new implementation in `_cleanupRunById` reads all documents for a run via
`db.ingestionRuns.getDocumentsByRunId(runId, trx)` and then filters in JavaScript
(`docs.filter((d) => d.status !== 'finalized')`). The documents repository method is a
leftover from an earlier design or a precautionary addition that is no longer needed.

Dead repository methods add surface area and create confusion about what is actually used.
Removing it keeps `DocumentsRepository` trim and avoids the risk of a future caller using
the wrong method (the `ingestionRuns.getDocumentsByRunId` version is the one that accepts
`trx` and participates in the transaction; the documents version does not).

---

## Detailed verification of round 1 blocking fixes

### B-002 — `completeRun` three-step pattern

`apps/backend/src/services/ingestion.ts`, lines 212–252.

The pattern now correctly separates the three steps:

**Step 1** (line 214): `db.ingestionRuns.update(runId, { status: 'moving' })` — no `trx`.
This sentinel update is committed immediately. If the process crashes during I/O, the run
stays in `moving` status and the ADR-018 startup sweep will clean it up.

**Step 2** (lines 221–229): `storage.moveStagingToPermanent(runId, doc.filename)` loop —
no transaction involved. Results are collected in `movedPaths`. Storage I/O cannot
participate in a DB transaction and is correctly placed outside it.

**Step 3** (lines 234–252): `db._knex.transaction(async (trx) => {...})` wraps all DB
writes atomically:

- `db.documents.updateStoragePath(doc.id, storagePath, trx)` — `trx` threaded through.
- `db.documents.updateStatus(doc.id, 'stored', trx)` — `trx` threaded through.
- Second loop: `db.documents.updateStatus(doc.id, 'finalized', trx)` — `trx` threaded.
- `db.ingestionRuns.update(runId, { status: 'completed', completedAt }, trx)` — `trx`
  threaded.

All DB writes are inside the single transaction. The `development-principles.md`
prohibition ("A service function that writes to two or more tables without wrapping all
writes in a single `db._knex.transaction()` block") is satisfied. **B-002 confirmed
resolved.**

### B-003 — `getDocumentsByRunId` now accepts `trx?`

`apps/backend/src/db/repositories/ingestionRuns.ts`, lines 72–78.

`getDocumentsByRunId` now accepts `trx?: Knex.Transaction` and uses `const qb = trx ?? db`
internally. `_cleanupRunById` (line 118) calls `db.ingestionRuns.getDocumentsByRunId(runId, trx)`,
passing the outer transaction. The read now participates in the same transaction as the
subsequent deletes, so the document snapshot is consistent with the delete operations.
**B-003 confirmed resolved.**

---

## Summary

**Outcome**: Pass

No blocking findings. The three blocking issues from round 1 (B-001, B-002, B-003) are all
resolved. The S-001, S-002, and S-004 suggestions have been applied. S-003 was not applied
(developer choice; acknowledged).

One new suggestion (S-005) flags the dead `getNonFinalizedByRunId` method in
`documents.ts`. It is not blocking.

The task is ready to advance to `reviewed`.
