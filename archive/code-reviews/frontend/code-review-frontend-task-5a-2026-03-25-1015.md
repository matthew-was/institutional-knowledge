# Code Review — Frontend Service — Task 5a: Form validation architecture — React Hook Form, Base UI fields, and Zod resolver

**Date**: 2026-03-25 10:15
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/package.json`
- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts`
- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`
- `apps/frontend/src/components/DocumentUploadForm/DocumentUploadForm.tsx`
- `apps/frontend/src/components/FilePickerInput/FilePickerInput.tsx`
- `apps/frontend/src/components/FilePickerInput/FilePickerInput.browser.test.tsx`
- `apps/frontend/src/components/MetadataFields/MetadataFields.tsx`
- `apps/frontend/src/components/MetadataFields/MetadataFields.browser.test.tsx`
- `apps/frontend/src/components/SubmitButton/SubmitButton.tsx`
- `documentation/decisions/architecture-decisions.md` (ADR-052 addition)
- `documentation/tasks/frontend-tasks.md` (Task 5a addition)
- `documentation/process/development-principles.md` (Form component state separation principle)

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

**Result**: Not met (one blocking finding — see Blocking #1 below)

The structural elements of the acceptance condition are all satisfied:

- `react-hook-form@^7.55.0` and `@hookform/resolvers@^5.2.2` are in `dependencies`, not `devDependencies`.
- `useDocumentUpload.ts` is co-located with `DocumentUploadForm.tsx` and owns all form state and logic.
- `DocumentUploadForm.tsx` contains no `useState` or `useForm` calls — confirmed by grep.
- `FilePickerInput` uses `Field.Root`, `Field.Label`, plain `<input type="file">` inside `Controller` (correct — `Field.Control` omitted for file input per task spec), and `Field.Error match={true}`.
- `MetadataFields` uses `Field.Root`, `Field.Label`, `Input` from `@base-ui/react/input` inside `Controller`, and `Field.Error match={true}`. The `Input` component reads `Field.Root`'s `invalid` context — confirmed by the `aria-invalid` assertion passing in tests.
- `SubmitButton` uses `Button` from `@base-ui/react/button`.
- `ValidationFeedback` directory is deleted — confirmed by filesystem check.
- Per-field `Field.Error` renders adjacent to each field.
- Server-error `<div role="alert">{serverError}</div>` is present in `DocumentUploadForm.tsx` at line 41.
- `pnpm biome check apps/frontend/src` passes with no fixes applied.
- `pnpm --filter frontend exec tsc --noEmit` passes with no errors.
- `pnpm --filter frontend test` passes: 11 test files, 78 tests.

The blocking finding is about the quality of the `useDocumentUpload` hook tests — see Blocking #1.

---

## Findings

### Blocking

**Blocking #1 — `useDocumentUpload` hook test does not verify `setValue` behaviour**

File: `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`, lines 16–32

The test "handleFileSelect pre-fills date and description from a parsed filename" calls
`handleFileSelect(file, parsed)` where `parsed = { date: '1965-07-04', description: 'Family portrait' }`
and then only asserts:

```ts
expect(result.current.serverError).toBeNull();
expect(result.current.duplicateRecord).toBeNull();
```

Neither of these assertions verifies the stated behaviour. `serverError` and `duplicateRecord`
were never set before the call — they begin as `null` — so both assertions pass regardless of
whether `setValue` was called. The test would pass even if the `setValue` calls inside
`handleFileSelect` were deleted entirely.

The task description states: "assert `handleFileSelect` calls `setValue` and clears server
error". The `setValue` side of this requirement is untested.

The `renderHook` setup provides real React Hook Form state. The hook does not expose `getValues`
in its return value, but the fix does not require exposing it — the test could instead verify
the rendered field values downstream, or the hook's return value could be extended with
`getValues` for testability, or the test could trigger a field state read via `formState`.

What must change: the first test (or a new additional test) must assert that after
`handleFileSelect` is called with a non-null `parsed` argument, the form's `date` and
`description` fields contain the expected values. The test as written is vacuous for the
`setValue` behaviour.

---

### Suggestions

**Suggestion #1 — Hook signature diverges from task spec (minor plan divergence)**

File: `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts`, line 17

The task spec states the hook accepts `maxFileSizeMb: number` as its sole parameter. The
implementation accepts `(maxFileSizeMb: number, acceptedExtensions: string[])` and passes
both to `createUploadFormSchema`, which requires both.

This is correct — `createUploadFormSchema` in `src/lib/schemas.ts` has always required both
parameters. The plan spec was written before the schema signature was finalised. The implementation
is the right approach, and all call sites (`DocumentUploadForm.tsx`, tests) pass both arguments.

No change required, but the task spec wording is mildly inconsistent with the implementation.
The developer may wish to note this divergence is intentional if a future reviewer queries it.

**Suggestion #2 — `handleFileSelect` `setValue` calls use `shouldValidate: false` consistently**

File: `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts`, lines 43–46

The three `setValue` calls all pass `{ shouldValidate: false }`. This is appropriate — pre-filling
from a filename should not trigger immediate validation errors before the user has interacted
with the fields. The behaviour is correct and consistent.

This is noted positively, not as a concern. No change required.

---

## Summary

**Outcome**: Fail

One blocking finding: the `useDocumentUpload` hook test for `handleFileSelect` does not verify
that `setValue` was called and the form's `date` and `description` fields were populated. The
test is vacuous for the `setValue` behaviour — both assertions pass regardless of whether
`setValue` is called.

All other acceptance condition elements are met. The three completion checks (`biome check`,
`tsc --noEmit`, full test suite) all pass. The structural implementation — hook/component
separation, `Field.*` usage, `match={true}` on `Field.Error`, `invalid` on `Field.Root`,
plain `<input type="file">` inside `Controller`, `Button` from `@base-ui/react/button`,
`ValidationFeedback` deleted, `react-hook-form` and `@hookform/resolvers` in `dependencies`
at correct versions — is correct throughout.

Task status set to `review_failed`.

The review is ready for the user to check.
