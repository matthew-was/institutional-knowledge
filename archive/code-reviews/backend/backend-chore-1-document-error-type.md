# Code Review — Backend Chore 1: Move `DocumentErrorType` to `packages/shared`

**Date**: 2026-03-30 08:08
**Task status at review**: in_review
**Round**: 2 (re-review after B-01 and B-02 fixes)
**Files reviewed**:

- `packages/shared/src/documentErrorType.ts` (new)
- `packages/shared/src/index.ts`
- `apps/backend/src/services/documents.ts`
- `apps/backend/src/routes/documents.ts`
- `apps/backend/src/routes/ingestion.ts`
- `apps/frontend/server/requests/documents.ts`
- `apps/frontend/server/routes/documents.ts`

---

## Acceptance condition

The full acceptance condition is:

> `DocumentErrorType` (including `missing_file`) is defined once in `packages/shared`;
> `apps/backend/src/services/documents.ts` imports it from `@institutional-knowledge/shared`;
> the bare `'missing_file'` string literals in `apps/backend/src/routes/documents.ts` and
> `apps/backend/src/routes/ingestion.ts` are replaced with a reference to the shared type
> (or typed against it); `apps/frontend/server/requests/documents.ts` imports
> `DocumentErrorType` from `@institutional-knowledge/shared` and defines `UploadErrorType`
> as `DocumentErrorType | 'upload_failed'`; `pnpm --filter backend exec tsc --noEmit` and
> `pnpm --filter frontend exec tsc --noEmit` both pass.

**Condition type**: automated

**Result**: Met

Each sub-clause is satisfied:

1. `DocumentErrorType` (including `missing_file`) is defined once in
   `packages/shared/src/documentErrorType.ts` and exported via `packages/shared/src/index.ts`
   as a `export type`.

2. `apps/backend/src/services/documents.ts` imports `DocumentErrorType` from
   `@institutional-knowledge/shared` (line 24–26).

3. `apps/backend/src/routes/documents.ts` — the bare `'missing_file'` literal that was
   previously on line 91 has been replaced with `const errorType: DocumentErrorType =
   'missing_file'` (lines 90–95). The value is then used in both `ERROR_STATUS[errorType]`
   for the status code and `{ error: errorType }` in the response body. Both sites are now
   type-safe against `DocumentErrorType`.

4. `apps/backend/src/routes/ingestion.ts` — `import type { DocumentErrorType }` added at
   line 14; the bare `'missing_file'` literal replaced with `const errorType: DocumentErrorType
   = 'missing_file'` (lines 121–127). The response body uses `errorType`, giving compile-time
   coverage.

5. `apps/frontend/server/requests/documents.ts` imports `DocumentErrorType` from
   `@institutional-knowledge/shared` (line 18–26) and defines `UploadErrorType` as
   `DocumentErrorType | 'upload_failed'` (line 35).

6. The `ERROR_STATUS` record in `apps/frontend/server/routes/documents.ts` is typed as
   `Record<UploadErrorType, ContentfulStatusCode>` and includes `finalized_document: 409` —
   confirming the full shared union is covered.

The TypeScript compiler condition (`tsc --noEmit`) is verified structurally: `ERROR_STATUS` in
`apps/backend/src/routes/documents.ts` is typed as `Record<DocumentErrorType, number>` and
covers all seven members of the union, so any member omitted or renamed in the shared type
would produce a compile error.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

Both blocking findings from round 1 (B-01, B-02) have been correctly resolved. All
sub-clauses of the acceptance condition are met. No new issues were found. Task status set
to `review_passed`.

The review is ready for the user to check.
