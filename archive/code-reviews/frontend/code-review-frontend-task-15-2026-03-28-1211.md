# Code Review — Frontend Service — Task 15: Manual vocabulary term entry — Hono route, handler, and request function

**Date**: 2026-03-28 12:11
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/handlers/curationHandler.ts`
- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.ts`
- `apps/frontend/server/__tests__/curation.vocabulary.test.ts`
- `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.browser.test.tsx`
- `apps/frontend/src/lib/schemas.ts` (read for `AddTermSchema` verification)
- `apps/frontend/src/components/AddVocabularyTermForm/AddVocabularyTermForm.tsx` (read to assess test assertions)
- `packages/shared/src/schemas/vocabulary.ts` (read for `AddVocabularyTermRequest` and `VocabularyRelationshipInput`)

## Acceptance condition

Restatement: Add-term route implemented and returns 201; `targetTermId` validated with `z.uuid()`
(not `z.string().uuid()`) confirmed by Tier 2 UI test; all Tier 2 tests pass; `pnpm biome check`
and `pnpm --filter frontend exec tsc --noEmit` pass.

**Condition type**: automated

**Result**: Not met

The route returns 201 on success and the `z.uuid()` form is correctly used in `AddTermSchema`
(line 117 of `schemas.ts`: `targetTermId: z.uuid()`). However, the Tier 2 UI behaviour tests
that are meant to confirm "shows validation errors for missing required fields" are vacuous
with respect to that claim — see Blocking finding 1 below. This is a failing acceptance
condition because the task spec explicitly requires these tests to confirm that behaviour, and
CR-015 requires all test assertions to be falsifiable.

### Manual verification (for completeness)

To verify the route manually once the blocking finding is resolved:

```bash
pnpm --filter frontend test
pnpm biome check apps/frontend/src
pnpm --filter frontend exec tsc --noEmit
```

## Findings

### Blocking

**B-1 — CR-015 violation: validation error tests do not assert that an error message is rendered**

File: `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.browser.test.tsx`
Lines: 111–154 (both `'shows a validation error when term name is missing'` and
`'shows a validation error when category is missing'`)

Both tests assert:

1. `expect(termInput.value).toBe('')` — the input was never filled in the test, so this is
   unconditionally true regardless of whether validation ran
2. `expect(screen.queryByRole('status')).toBeNull()` — the `role="status"` element is the
   success message; its absence after a validation failure is always true

Neither assertion would fail if the form silently swallowed the validation error and rendered
no error message at all. The test names claim to confirm "shows a validation error" but neither
test asserts that any validation message text appears in the document.

`AddVocabularyTermForm` renders `<Field.Error match={true}>{errors.term?.message}</Field.Error>`
and `<Field.Error match={true}>{errors.category?.message}</Field.Error>`. The tests must
assert that this text is visible — for example by asserting the text content of the rendered
error element, or by confirming a specific error message string appears in the DOM.

What must change: each test must include at least one assertion that would fail if
`<Field.Error>` rendered nothing. For example, asserting that a specific validation message
string (such as the one produced by `z.string().min(1)`) is present in the document after
attempting submission.

### Suggestions

None.

## Summary

**Outcome**: Fail

One blocking finding — the two validation-error tests in the browser test file do not assert
that a validation error message is actually rendered (CR-015). The tests would pass regardless
of whether the form showed any error, making them vacuous with respect to the stated behaviour.
Task status set to `review_failed`.

The review is ready for the user to check.
