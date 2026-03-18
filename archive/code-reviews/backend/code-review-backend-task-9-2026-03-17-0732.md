# Code Review — Backend Service — Task 9: Implement document curation handlers (DOC-006, DOC-007, DOC-008, DOC-009)

**Date**: 2026-03-17 07:32
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/repositories/pipelineSteps.ts` (new)
- `apps/backend/src/services/curation.ts` (new)
- `apps/backend/src/services/curation.test.ts` (new)
- `apps/backend/src/routes/curation.ts` (new)
- `apps/backend/src/db/repositories/documents.ts` (modified — `getFlagged`, `clearFlag`, `updateMetadata` added; `DocumentMetadataFields` interface added)
- `apps/backend/src/db/repositories/index.ts` (modified — `pipelineSteps` exports added)
- `apps/backend/src/db/index.ts` (modified — `pipelineSteps` added to `DbInstance`)
- `apps/backend/src/routes/index.ts` (modified — `createCurationRouter` mounted)
- `apps/backend/src/index.ts` (modified — `curationService` added to `AppDependencies`)
- `apps/backend/src/server.ts` (modified — `createCurationService` wired in)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (modified — `curationService` stub added to `stubDeps`)

---

## Acceptance condition

**Restatement**: Vitest unit tests with mocked Knex confirm:

- (a) `getDocumentQueue`: returns paginated results; returns only documents with active flags;
  derives `archiveReference` for each row.
- (b) `getDocument`: returns 404 for unknown ID; returns all metadata fields including
  `organisations` array.
- (c) `clearFlag`: returns 409 when no flag exists; sets `flag_reason` and `flagged_at` to null;
  does not modify `pipeline_steps`.
- (d) `updateDocumentMetadata`: returns 400 for whitespace-only description; returns 400 for
  invalid date; applies partial update; re-derives `archiveReference` after update.

All tests pass.

**Condition type**: automated

**Result**: Partially met — one sub-condition is not covered by a test.

Sub-conditions (a), (b), and (c) are fully covered by `apps/backend/src/services/curation.test.ts`.
The first three parts of (d) are covered: whitespace description returns `whitespace_description`
error type; `not_found` for unknown ID; partial update confirms only provided fields are forwarded
to `updateMetadata`; `archiveReference` is re-derived from the updated row.

However, condition (d) explicitly requires a test confirming "returns 400 for invalid date". The
invalid-date validation is enforced by the `UpdateDocumentMetadataRequest` Zod schema
(`date: z.string().regex(...)`) and is caught by the `validate({ body: ... })` middleware before
the service is called. This is the same structural arrangement as Task 8's "returns 400 for invalid
date format" condition. In Task 8's code review, the reviewer explicitly confirmed this met the
condition because the validate middleware returns HTTP 400 before the service runs, and this was
cross-confirmed in the Task 8 verification notes.

For Task 9 the same structural argument applies. However, unlike Task 8 (where a note was made
confirming the structural approach), there is no test in `curation.test.ts` or at the route level
(via supertest against the assembled curation router) that demonstrates an invalid date input
produces a 400 response. The acceptance condition lists this as a unit test item alongside the
others. This is a blocking finding — see B-001 below.

---

## Findings

### Blocking

**B-001 — Missing test for "returns 400 for invalid date" (condition d)**

`apps/backend/src/services/curation.test.ts` — no test exists for the invalid date case.

The acceptance condition explicitly states "returns 400 for invalid date" as one of the automated
test requirements for `updateDocumentMetadata`. A unit test at the service level cannot cover this
(the service does not validate date format — it delegates to the Zod schema). The test must be at
the route level: a supertest request against the assembled curation router with an invalid date
value in the body should return 400 with `error: 'validation_error'`.

Without this test the condition is not met as stated. The test must be added before this task can
advance to `reviewed`.

---

### Suggestions

**S-001 — `pipelineStatus` semantics are not documented**

`apps/backend/src/db/repositories/pipelineSteps.ts`, line 17–24; and
`apps/backend/src/services/curation.ts`, line 84.

`getLatestFailedStepName` returns the `step_name` of the most recently created failed step, or
`null`. The service maps `null` to `''` (empty string), which means a document with no failed
steps produces `pipelineStatus: ''` in the response. The `DocumentQueueItem` schema defines
`pipelineStatus` as a non-nullable `z.string()` with an example of `'step_2_failed'`. An empty
string is technically valid but a consumer has no way to distinguish "no failed step" from
"step name is empty string". A brief JSDoc comment in `pipelineSteps.ts` and/or `curation.ts`
explaining that `''` means "no failed step" would make this contract explicit. Not blocking; the
schema accepts the value and the frontend can handle it.

**S-002 — `updateMetadata` fallback to `existing` is unreachable**

`apps/backend/src/services/curation.ts`, lines 176–178.

```typescript
const doc = updated ?? existing;
```

`updateMetadata` in the repository runs an `UPDATE` followed by a `SELECT` for the same `id`. By
the time `updateMetadata` is called, `existing` is known to be non-undefined (the `getById` guard
on line 167 would have returned early otherwise). The `?? existing` fallback and the comment "fall
back to existing if the follow-up getById somehow returns undefined (should not happen)" describe a
case that cannot occur given the guard above. The comment introduces doubt where there is none. A
simpler approach would be to assert or cast the result and remove the dead branch. Not blocking.

**S-003 — `DocumentIdParams` schema is local to the route file but could be shared**

`apps/backend/src/routes/curation.ts`, line 29.

```typescript
const DocumentIdParams = z.object({ id: z.string().uuid() });
```

The same pattern will likely be needed in Task 10 (vocabulary routes accept `:termId`) and may
recur in later tasks. Extracting a shared `UuidParam` schema to a small helper in
`src/middleware/validate.ts` or `src/routes/shared.ts` would reduce repetition. Not blocking for
this task; the local definition is correct.

**S-004 — `clearFlag` accepts `flagReason` check against `null` but not against `undefined`**

`apps/backend/src/services/curation.ts`, line 140.

```typescript
if (doc.flagReason === null) {
```

`DocumentRow.flagReason` is typed as `string | null`. The check is correct for the defined type.
This is fine as written, but worth noting that if the Knex camelCase mapping ever returns
`undefined` for a nullable column instead of `null`, this guard would silently pass. In practice
the existing Knex `postProcessResponse` hook does not produce `undefined` for nullable columns,
so this is safe. No action needed.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the acceptance condition for `updateDocumentMetadata` requires an
automated test confirming that an invalid date value returns HTTP 400. No such test exists. The
behaviour is enforced structurally by the Zod schema and `validate` middleware, but the test must
be written to satisfy the stated acceptance condition.

All other review areas pass:

- TypeScript strict mode: no `any` usages, all function signatures explicitly typed.
- Security at boundaries: no user-supplied values passed to DB queries without Zod validation; no
  document content in logs (identifiers only); no secrets in code.
- Infrastructure as Configuration: no hardcoded provider names or paths.
- Dependency injection: `createCurationService` accepts `{ db, log }` — correctly narrowed; route
  factory accepts `CurationService` only.
- Error handling: all error paths return correct HTTP codes via exhaustive `ERROR_STATUS` record;
  `next(err)` reserved for unexpected throws; `clearFlag` (409) and `not_found` (404) mapped
  correctly.
- Data access: all DB access via `db.documents.*` and `db.pipelineSteps.*`; no `db._knex` outside
  repositories; no direct SQL in service or route files.
- Plan compliance: routes match the backend plan route table; handler logic matches the plan's
  service layer descriptions; `pipelineSteps` repository is read-only consistent with the comment
  in `db/index.ts` ("write access owned by Python service — ADR-031").
- Test quality: all tests for covered conditions test actual behaviour, not weaker approximations.

Task returns to `in_progress`. Once B-001 is resolved, re-submit for review.
