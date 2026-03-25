# Code Review — Frontend Service — Task 5: Document upload form — components and client-side validation

**Date**: 2026-03-25 04:18
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/lib/config.ts`
- `apps/frontend/src/components/FilePickerInput/FilePickerInput.tsx`
- `apps/frontend/src/components/FilePickerInput/FilePickerInput.browser.test.tsx`
- `apps/frontend/src/components/MetadataFields/MetadataFields.tsx`
- `apps/frontend/src/components/DuplicateConflictAlert/DuplicateConflictAlert.tsx`
- `apps/frontend/src/components/DuplicateConflictAlert/DuplicateConflictAlert.browser.test.tsx`
- `apps/frontend/src/components/ValidationFeedback/ValidationFeedback.tsx`
- `apps/frontend/src/components/SubmitButton/SubmitButton.tsx`
- `apps/frontend/src/components/SubmitButton/SubmitButton.browser.test.tsx`
- `apps/frontend/src/components/DocumentUploadForm/DocumentUploadForm.tsx`
- `apps/frontend/src/app/(private)/upload/page.tsx`
- `apps/frontend/vitest.config.ts`

## Acceptance condition

**Stated condition**: All five components exist and are correctly structured; Tier 1 RTL tests
pass including the `null` date to "Undated" assertion on `DuplicateConflictAlert`;
`pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

All six components are present and correctly structured (FilePickerInput, MetadataFields,
ValidationFeedback, DuplicateConflictAlert, SubmitButton, DocumentUploadForm).

Tier 1 RTL tests are present for the three required components:

- `DuplicateConflictAlert.browser.test.tsx` — covers description/date/archive-reference
  rendering and explicitly asserts `screen.getByText(/Undated/)` when `date: null` is
  passed. This is the load-bearing assertion stated in the acceptance condition. ✓
- `FilePickerInput.browser.test.tsx` — covers file input rendering, accessible label, and
  `accept` attribute value. ✓
- `SubmitButton.browser.test.tsx` — covers enabled, disabled, and loading states, including
  ARIA `aria-disabled` attribute assertion. ✓

The test files use the `.browser.test.tsx` suffix, which routes them into the `jsdom`
project in `vitest.config.ts`. ✓

The `// TODO Task 6: wire API call` comment is present at
`DocumentUploadForm.tsx` line 71. ✓

The `upload/page.tsx` correctly imports `config` via `@/lib/config` (not a direct relative
path into `server/`). ✓

Manual verification required for lint and typecheck:

- Run `pnpm --filter frontend biome check apps/frontend/src` — expect zero errors.
- Run `pnpm --filter frontend exec tsc --noEmit` — expect zero type errors.

## Findings

### Blocking

None.

### Suggestions

**S-1**: `FilePickerInput.tsx` line 31 — redundant `aria-label`

The `<input>` element carries both an associated `<label>` (via `htmlFor="file-upload"`) and
an explicit `aria-label="Select document"`. Per the ARIA specification, `aria-label` takes
precedence over the programmatically associated `<label>` when both are present; the `<label>`
element becomes inaccessible to assistive technology as a result. Because the `<label>` already
provides the correct accessible name, the `aria-label` is redundant and can be removed.

**S-2**: `DuplicateRecord` interface is defined in two places

`ValidationFeedback.tsx` lines 5–9 and `DocumentUploadForm.tsx` lines 14–18 each declare an
identical `DuplicateRecord` interface. TypeScript structural typing means this works at runtime,
but the duplication creates a maintenance risk — if the shape is updated in one file, the other
may be missed. Consider exporting `DuplicateRecord` from one location (e.g.
`ValidationFeedback.tsx`, since it is the consuming component) and importing it into
`DocumentUploadForm.tsx`.

**S-3**: `ACCEPTED_EXTENSIONS` constant is duplicated with different shapes

`FilePickerInput.tsx` line 6 defines `ACCEPTED_EXTENSIONS` as a comma-separated string
(for the HTML `accept` attribute), and `DocumentUploadForm.tsx` line 12 defines it as a
`string[]` (for the Zod schema factory). The two constants must stay in sync manually. A
single source of truth — e.g. an array constant in a shared location, with the string form
derived via `.join(',')` — would eliminate the risk of drift between the UI input filter and
the schema validation.

**S-4**: `DocumentUploadForm.tsx` line 64 — `setSubmitting(false)` is redundant

In the validation-failure branch (lines 57–65), `setSubmitting(false)` is called at line 64.
At that point in the code, `submitting` has not been set to `true` — the `setSubmitting(true)`
call is at line 69, after the early return. The call at line 64 is a no-op and can be removed
for clarity.

## Summary

**Outcome**: Pass

No blocking findings. The acceptance condition is met: all six components are present and
correctly structured, the `null` date → "Undated" test assertion exists and tests actual
component behaviour, the `'use client'` directive is present on all five task components,
the `upload/page.tsx` Server Component correctly reads config on the server and passes the
primitive to the Client Component as a prop, and the `// TODO Task 6` comment is in place.
Four suggestions are noted for the developer's consideration.

The review is ready for the user to check.
