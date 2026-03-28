# Code Review — Frontend Service — Task 16: Request function contract sweep — Tier 1 unit tests

**Date**: 2026-03-28 13:17
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/requests/__tests__/contractSweep.test.ts` (new file)
- `apps/frontend/server/requests/client.ts` (read for reference — not changed)
- `apps/frontend/server/requests/documents.ts` (read for reference — not changed)
- `apps/frontend/server/requests/curation.ts` (read for reference — not changed)

---

## Acceptance condition

**Condition type**: automated

`server/requests/__tests__/contractSweep.test.ts` exists and covers all 12 request functions
listed in the task; each test asserts URL, method, `x-internal-key` presence, and body or
param structure; all tests pass; `pnpm biome check` and `pnpm --filter frontend exec tsc
--noEmit` pass.

**Result**: Met

**Coverage of all 12 functions**: confirmed.

| Function | Test line | Method spy | URL asserted | Body / params asserted |
| --- | --- | --- | --- | --- |
| `initiateUpload` (DOC-001) | 115 | `spies.post` | `api/documents/initiate` | `options.json` = body |
| `uploadFile` (DOC-002) | 144 | `spies.post` | `api/documents/uid-1/upload` | `options.body` = formData; `options.json` = undefined |
| `finalizeUpload` (DOC-003) | 172 | `spies.post` | `api/documents/uid-1/finalize` | `options.json` and `options.body` both undefined |
| `deleteUpload` (DOC-005) | 200 | `spies.delete` | `api/documents/uid-1` | none (void call) |
| `fetchDocumentQueue` (DOC-006) | 231 | `spies.get` | `api/curation/documents` | `options.searchParams` = params |
| `fetchDocumentDetail` (DOC-007) | 249 | `spies.get` | `api/documents/doc-1` | none (GET, no body) |
| `clearDocumentFlag` (DOC-008) | 270 | `spies.post` | `api/documents/doc-1/clear-flag` | `options.json` = undefined |
| `updateDocumentMetadata` (DOC-009) | 290 | `spies.patch` | `api/documents/doc-1/metadata` | `options.json` = patch |
| `fetchVocabulary` (VOC-001) | 315 | `spies.get` | `api/curation/vocabulary` | `options.searchParams` = params |
| `acceptTerm` (VOC-002) | 333 | `spies.post` | `api/curation/vocabulary/${termId}/accept` | `options.json` = undefined |
| `rejectTerm` (VOC-003) | 358 | `spies.post` | `api/curation/vocabulary/${termId}/reject` | `options.json` = undefined |
| `addTerm` (VOC-004) | 383 | `spies.post` | `api/curation/vocabulary/terms` | `options.json` = body |

**`x-internal-key` coverage**: The dedicated test at line 71 asserts that
`ky.create` is called with `x-internal-key` set to the config value. This is the correct
layer to assert — the header is set once in `createExpressClient` via `ky.create({ headers:
{ 'x-internal-key': config.express.internalKey } })`. Because Ky merges instance-level
headers into every outbound request automatically, confirming the header is present in the
`ky.create` call is the meaningful assertion. Per-request assertions would test Ky's own
merging behaviour, not the project's code. The approach is correct.

**Method assertions**: implicit via which spy is called. All tests use
`expect(spies.[method]).toHaveBeenCalledOnce()`, which confirms the correct HTTP method.

**Tier compliance**: the file header explicitly states "No MSW, no running server (pure unit
test — Tier 1)". No `supertest`, no MSW, no Hono app construction is present. Tier 1
placement is correct.

---

## Findings

### Blocking

None.

### Suggestions

**S-1 — `uploadFileBytes` vs `uploadFile` naming discrepancy**
`apps/frontend/server/requests/__tests__/contractSweep.test.ts`, line 144–169, and
`apps/frontend/server/requests/documents.ts`, line 57.

The task spec table (Task 16) names the DOC-002 function `uploadFileBytes`. The actual
implementation in `documents.ts` uses `uploadFile`. The test correctly calls `uploadFile`
(matching the implementation), so no behaviour is broken. However, the task description is
now inconsistent with the code. The developer may want to update the task table entry to
read `uploadFile` so future readers are not confused. This is a documentation-only change
— the implementation is correct as-is.

---

## Summary

**Outcome**: Pass

No blocking findings. The test file covers all 12 request functions, asserts the correct HTTP
method (via spy selection), URL, body or param structure, and `x-internal-key` header at the
correct layer for every function. All CR-015 assertions are falsifiable. The file is a clean
Tier 1 test with no server infrastructure. One naming inconsistency between the task
description and the implementation is noted as a suggestion.

Task status set to `review_passed`.

The review is ready for the user to check.
