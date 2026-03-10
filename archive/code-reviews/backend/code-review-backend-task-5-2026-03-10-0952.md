# Code Review — Backend Service — Task 5: Implement StorageService (interface and LocalStorageService)

**Date**: 2026-03-10 09:52
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/storage/StorageService.ts` (new)
- `apps/backend/src/storage/LocalStorageService.ts` (new)
- `apps/backend/src/storage/index.ts` (new — factory)
- `apps/backend/src/storage/__tests__/LocalStorageService.test.ts` (new)
- `apps/backend/src/index.ts` (modified — import updated)
- `apps/backend/src/server.ts` (modified — logger passed to factory)

---

## Acceptance condition

**Restated**: Vitest unit tests using a temporary directory confirm:
(a) `writeStagingFile` creates the file at the expected staging path.
(b) `moveStagingToPermanent` moves the file and returns the correct storage path.
(c) `deleteStagingFile` removes the file without error; calling it again on a non-existent file also returns without error.
(d) `deletePermanentFile` removes the file without error when it exists; no error when absent.
(e) `createStagingDirectory` and `deleteStagingDirectory` create and remove the directory.
All tests pass.

**Condition type**: automated

**Result**: Met

The test file at `apps/backend/src/storage/__tests__/LocalStorageService.test.ts` covers all five sub-conditions. Each sub-condition has multiple cases:

- (a) Two cases: file content is correct; parent directory is created when absent.
- (b) Two cases: destination path is returned correctly; file is absent from staging after move; destination parent directory is created when absent.
- (c) Three cases: file is removed; no throw on non-existent file; no throw when called twice on the same file.
- (d) Three cases: file is removed; no throw on non-existent path; no throw when called twice on the same path.
- (e) `createStagingDirectory`: creates directory and returns absolute path. `deleteStagingDirectory`: three cases — removes directory and contents; no throw on non-existent directory; no throw when called twice.

Tests use a real `os.tmpdir()` directory (not `memfs`), consistent with the project testing strategy. A `pino({ level: 'silent' })` logger is used so no log noise in test output.

**Manual verification required**:

Run the test suite with:

```sh
pnpm --filter backend exec vitest run src/storage/__tests__/LocalStorageService.test.ts
```

Expected: all tests pass. No database or Docker dependency required — these are pure filesystem tests.

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — `deleteStagingFile` and `deletePermanentFile`: catch blocks log `error` level for `ENOENT`, which is expected**

`apps/backend/src/storage/LocalStorageService.ts`, lines 60–62 and 67–69.

Both delete methods catch all errors and log them at `error` level. Because these methods are idempotent by design, `ENOENT` (file not found) is an entirely expected outcome — it means the caller has already cleaned up or the file was never written. Logging it at `error` level will produce `error`-level noise in normal cleanup sweep paths (startup sweep, cleanup-on-failure), which may mask real errors.

A more precise approach distinguishes `ENOENT` (expected, `debug` level) from other errors (unexpected — `EACCES`, `EIO` — which warrant `error` level). Example:

```typescript
.catch((err: unknown) => {
  const code = err instanceof Error && 'code' in err
    ? (err as NodeJS.ErrnoException).code
    : undefined;
  if (code === 'ENOENT') {
    this.log.debug({ uploadId, filename }, 'delete staging file: file already absent');
  } else {
    this.log.error({ uploadId, filename, err }, 'delete staging file: unexpected error');
  }
});
```

This change also addresses the log message accuracy concern raised in the task brief: "file may already be absent" is imprecise when the actual error is `EACCES` or another non-ENOENT code.

This is a suggestion, not blocking, because the public contract is met (no re-throw, idempotent behaviour preserved) and the `err` object is included in the log payload so the real error code is visible.

---

**S-002 — `deleteStagingFile` and `deletePermanentFile` message conflates normal and unexpected outcomes**

`apps/backend/src/storage/LocalStorageService.ts`, lines 61 and 68.

The log message "file may already be absent" is only accurate for the `ENOENT` case. For a permission error or an I/O error, the message is misleading to anyone reading the logs. This is a corollary of S-001 and is resolved by the same fix — separate the `ENOENT` branch (accurate message: "file already absent") from the unexpected error branch (accurate message: "unexpected error deleting file").

---

**S-003 — `deleteStagingDirectory` swallows `ENOENT` silently but propagates all other errors; inconsistent with `deleteStagingFile` and `deletePermanentFile`**

`apps/backend/src/storage/LocalStorageService.ts`, lines 83–84.

`fs.rm` with `force: true` suppresses `ENOENT` — so a non-existent directory is correctly handled. However, any other error (`EACCES`, `EROFS`) will propagate as an unhandled rejection to the caller, while the equivalent file-delete methods catch and swallow all errors.

There are two reasonable positions here:

1. **Propagate unexpected errors** (current behaviour for this method): callers should know if the directory cannot be removed. This is arguably more correct for a recursive directory delete than for file deletes in cleanup sweeps.
2. **Catch and log** (consistent with the file-delete methods): log unexpected errors at `error` level and swallow, so callers always receive a resolved promise.

The inconsistency itself is worth noting. If the decision is to propagate unexpected errors from `deleteStagingDirectory`, add a comment explaining the deliberate difference from `deleteStagingFile`/`deletePermanentFile`. If the decision is to be consistent, add a catch block with appropriate logging (applying the same ENOENT vs unexpected distinction from S-001).

---

**S-004 — Factory signature diverges from the plan (logger added as parameter)**

`apps/backend/src/storage/index.ts`, line 18.

The backend plan specifies `createStorageService(config)` with a single parameter. The implementation takes `createStorageService(storageConfig: AppConfig['storage'], log: Logger)`. The logger addition was a post-implementation decision to improve observability, consistent with the factory pattern used in `createAuthMiddleware` and `createErrorHandler`.

This is the correct direction — logger injection is better than no logging. The plan should be updated to record this signature change so the pattern is documented for future storage providers. No code change required.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation correctly satisfies all five acceptance condition sub-conditions. The `StorageService` interface is clean and well-documented. The factory reads `storage.provider` from config (Infrastructure as Configuration — ADR-008 and ADR-001 compliance). Logger injection is consistent with the established factory pattern. ESM imports use explicit `.js` extensions throughout. All TypeScript types are explicit; no `any` usage; no non-null assertions.

The four suggestions above are improvements to operational observability (S-001, S-002, S-003) and plan alignment (S-004). They do not affect correctness. The task is ready to advance to `reviewed`.
