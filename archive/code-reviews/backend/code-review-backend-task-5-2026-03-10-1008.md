# Code Review — Backend Service — Task 5 Follow-up: S-001/S-002/S-003 fixes

**Date**: 2026-03-10 10:08
**Task status at review**: code_complete
**Scope**: Follow-up review of three suggestions from the original review
(`archive/code-reviews/backend/code-review-backend-task-5-2026-03-10-0952.md`).
Only the changes listed below are in scope — no re-review of the full file.
**Files reviewed**:

- `apps/backend/src/storage/LocalStorageService.ts` (modified — S-001/S-002/S-003 fixes)

---

## Acceptance condition

The original acceptance condition (automated — all five Vitest sub-conditions pass) was
confirmed Met in the original review. This follow-up covers suggestion fixes only; the
acceptance condition status is unchanged.

---

## Findings

### S-001/S-002 — `deleteStagingFile` catch block

The fix is correctly implemented. The catch block extracts `code` from the error using
`err instanceof Error && 'code' in err`, then casts to `NodeJS.ErrnoException`. This is
the exact pattern suggested in S-001. Two distinct branches:

- `ENOENT` → `this.log.debug` with message `'delete staging file: file already absent'`
- All other errors → `this.log.error` with `err` in the payload and message
  `'delete staging file: unexpected error'`

The log bindings (`uploadId`, `filename`, `fullPath`) are present in both branches.
No new issues introduced.

**Result**: Correctly actioned.

---

### S-001/S-002 — `deletePermanentFile` catch block

The same pattern is applied consistently. Log bindings use `storagePath` (correct for
this method, which does not have `uploadId`/`filename` in scope). Messages parallel the
staging file method: `'delete permanent file: file already absent'` for ENOENT and
`'delete permanent file: unexpected error'` for all other errors.

**Result**: Correctly actioned.

---

### S-003 — `deleteStagingDirectory` catch block

A catch block is added. Because `fs.rm` with `force: true` already suppresses ENOENT,
no ENOENT branch is needed, and the comment explaining this is present and accurate:

```typescript
// force: true suppresses ENOENT — idempotent when directory does not exist
```

Any unexpected error (e.g. `EACCES`, `EROFS`) logs at `error` level with `runId`,
`fullPath`, and `err` in the payload. This is consistent with the unexpected-error
branches in `deleteStagingFile` and `deletePermanentFile`, resolving the inconsistency
flagged in S-003.

**Result**: Correctly actioned.

---

### New issues

None. The changes are isolated to the three catch blocks and introduce no new logic,
type assertions, or dependencies. TypeScript type safety is maintained: the
`NodeJS.ErrnoException` cast is guarded by the `instanceof Error && 'code' in err`
check in all three methods.

---

## Blocking

None.

## Suggestions

None.

---

## Summary

**Outcome**: Pass

All three suggestions (S-001, S-002, S-003) have been correctly and consistently
implemented. The ENOENT distinction in `deleteStagingFile` and `deletePermanentFile`
is accurate and the log levels are appropriate. The `deleteStagingDirectory` catch block
is consistent with the file-delete methods and the comment correctly explains why no
ENOENT branch is required. No new issues were introduced. The follow-up is complete.
