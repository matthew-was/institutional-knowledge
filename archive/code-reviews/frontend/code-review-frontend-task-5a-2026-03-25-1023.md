# Code Review — Frontend Service — Task 5a: Form validation architecture — React Hook Form, Base UI fields, and Zod resolver

**Date**: 2026-03-25 10:23
**Task status at review**: in_review
**Round**: Re-review (following review_failed on 2026-03-25 10:15)
**Files reviewed**:

- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts`
- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`

---

## Scope of this re-review

The previous review (2026-03-25 10:15) failed on one blocking finding: the first test in
`useDocumentUpload.browser.test.ts` was vacuous for `setValue` behaviour — it only asserted
`serverError` and `duplicateRecord` were null, which were never set, so the test passed
regardless of whether `setValue` was called.

The fix applied:

- `getValues` added to the `useDocumentUpload` hook's return value (line 57 of `useDocumentUpload.ts`)
- First test now calls `result.current.getValues('date')` and
  `result.current.getValues('description')` after `handleFileSelect`, asserting the values
  match what was passed in `parsed`

The two suggestions from the previous review were accepted as no-change (intentional
decisions).

---

## Acceptance condition

Restated from Task 5a:

> `react-hook-form` and `@hookform/resolvers` are in `package.json` `dependencies`;
> `useDocumentUpload.ts` exists co-located with `DocumentUploadForm.tsx` and owns all form
> state and logic; `DocumentUploadForm.tsx` contains no `useState` or `useForm` calls;
> `FilePickerInput` and `MetadataFields` use `Field.Root`, `Field.Label`,
> `Field.Control`/plain `<input>`, `Field.Error`; `SubmitButton` uses `Button` from
> `@base-ui/react/button`; `ValidationFeedback` component and directory are deleted;
> per-field errors render via `Field.Error` adjacent to their fields; server-error
> `<div role="alert">` present for non-field errors; all Tier 1 tests pass including new
> `useDocumentUpload` hook tests; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit`
> pass.

**Condition type**: automated

**Result**: Met

All structural elements confirmed in the previous review remain intact. The blocking finding
is now resolved:

- `getValues` is returned from `useDocumentUpload` at line 57.
- The first test (lines 16–32) calls `result.current.getValues('date')` and
  `result.current.getValues('description')` after `act(() => { result.current.handleFileSelect(file, parsed); })`.
- The assertions `expect(result.current.getValues('date')).toBe('1965-07-04')` and
  `expect(result.current.getValues('description')).toBe('Family portrait')` directly verify
  that `setValue` populated the RHF store. If the `setValue` calls in `handleFileSelect` were
  removed, these assertions would fail — the test is no longer vacuous.
- A second test (lines 34–47) isolates the `serverError`/`duplicateRecord` clearing behaviour
  with `parsed = null`, which is a clean separation of concerns.
- `pnpm biome check apps/frontend/src` — passes, no fixes applied.
- `pnpm --filter frontend exec tsc --noEmit` — passes, no errors.
- `pnpm --filter frontend test` — passes: 11 test files, 78 tests.

The `getValues` addition to the return value is a testability extension only; it does not
change the hook's behaviour for any existing call site (`DocumentUploadForm.tsx` does not
use it).

**Verification instructions for the developer**: run the three commands above; all must pass.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

The single blocking finding from the previous review is resolved. The test now makes
assertions that are falsifiable with respect to the `setValue` calls inside
`handleFileSelect`. All three completion checks pass. No new issues were introduced by the
fix.

Task status set to `review_passed`.

The review is ready for the user to check.
