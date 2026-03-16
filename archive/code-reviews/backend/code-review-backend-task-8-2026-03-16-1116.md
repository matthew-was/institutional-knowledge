# Code Review — Backend Service — Task 8: Document upload handlers (DOC-001, DOC-002, DOC-003, DOC-005)

**Date**: 2026-03-16 11:16
**Task status at review**: code_complete
**Review round**: 2 (follow-up after actioning suggestions S-001 to S-004 from review 1)
**Files reviewed**:

- `packages/shared/src/serviceResult.ts`
- `packages/shared/src/index.ts`
- `apps/backend/src/db/repositories/documents.ts`
- `apps/backend/src/db/repositories/index.ts`
- `apps/backend/src/db/index.ts`
- `apps/backend/src/services/documents.ts`
- `apps/backend/src/routes/documents.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/routes/index.ts`
- `apps/backend/src/services/documents.test.ts`
- `apps/backend/src/services/__tests__/documents.integration.test.ts`
- `apps/backend/src/middleware/__tests__/middleware.test.ts`

---

## Acceptance condition

**Restated**: Condition type — `both`.

**Automated part**: Vitest unit tests with mocked Knex, StorageService, and config confirm:

- (a) `initiateUpload`: returns 422 for unsupported extension; returns 422 for over-limit file
  size; returns 400 for invalid date format; returns 400 for whitespace-only description;
  returns 201 with `uploadId` on valid request.
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

**Result**: Met.

The acceptance condition was assessed as Met in review 1 with the same reasoning. The fixes
applied since review 1 do not affect this assessment. All unit test conditions remain covered;
the integration test still covers the full lifecycle. The "returns 400 for invalid date
format" condition is satisfied structurally: the Zod `InitiateUploadRequest` schema
validates the date regex (present at line 35 of the schema file) and the `validate`
middleware returns a 400 validation error before the service is called, so no change to
the service-level unit tests was required or appropriate.

**Manual verification required by the developer**:

Run the following commands to confirm no TypeScript or lint regressions:

```sh
pnpm --filter backend build
pnpm --filter backend exec biome check src
```

Both must complete with no errors. The test database must be running for the integration
test:

```sh
docker compose -f docker-compose.test.yml up -d
```

Then run all tests:

```sh
pnpm --filter backend test
```

---

## Verification of suggestions actioned from review 1

### S-001 — Immediate staging file cleanup on duplicate detection

**Verified**: `apps/backend/src/services/documents.ts`, lines 241–243.

`storage.deleteStagingFile(uploadId, doc.filename)` is called immediately when a duplicate
is found, before the 409 error is returned. The inline comment correctly describes the
startup sweep as a safety fallback. This is the right approach: immediate cleanup removes
the orphaned file in the common case; the sweep is the last-resort backstop.

### S-002 — Inline comments on `req.params.uploadId as string` casts

**Verified**: `apps/backend/src/routes/documents.ts`, lines 95, 126, and 149.

All three `as string` casts now have the comment `// Express types params as
Record<string, string> — cast is safe here`. The comment is accurate and sufficient.

### S-003 — No-extension filename returns `unsupported_extension`

**Verified**: `apps/backend/src/services/documents.ts`, lines 142–147.

`dotIndex === -1` guard added. When no `.` is present, `ext` is set to `''`. An empty
string is not in the accepted extensions list, so the function returns `unsupported_extension`.
The error message will read `File extension '' is not in the accepted list: ...` — this is
unambiguous and accurate. The fix is correct.

### S-004 — Integration tests use `db.documents.getById()` instead of `db._knex`

**Verified**: `apps/backend/src/services/__tests__/documents.integration.test.ts`, lines
136, 159, 176, and 219.

All intermediate state checks now use `db.documents.getById(uploadId)` consistently. The
`db._knex` reference is used only in `cleanAllTables(db._knex)` in `afterEach`, which is
the established pattern for table cleanup and is correct.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All four suggestions from review 1 have been correctly addressed. No new findings were
identified in this round. Task 8 is ready to advance to `reviewed`.
