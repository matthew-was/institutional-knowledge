# Code Review — Frontend Service — Task 14: Manual vocabulary term entry — components and page

**Date**: 2026-03-28 10:36
**Task status at review**: in_review
**Review round**: 2 (re-review following `review_failed`)
**Previous review**: `documentation/tasks/code-reviews/code-review-frontend-task-14-2026-03-28-0858.md`

**Files reviewed**:

- `apps/frontend/src/lib/schemas.ts`
- `apps/frontend/src/lib/__tests__/schemas.test.ts`
- `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.ts`
- `apps/frontend/src/components/TermRelationshipsInput/TermRelationshipsInput.browser.test.tsx`
- `apps/frontend/src/components/AddVocabularyTermForm/AddVocabularyTermForm.browser.test.tsx`

---

## Acceptance condition

The acceptance condition is: `AddVocabularyTermForm` and `TermRelationshipsInput` exist; Tier 1
RTL tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

Both components exist. The three previously vacuous assertions have been replaced with falsifiable
ones (see B-2 confirmation below). All test assertions now provide genuine regression protection.

---

## Previous findings — disposition

### B-1: `AddTermFormSchema` duplicate schema in `useAddVocabularyTerm.ts`

**Resolved.**

The local `AddTermFormSchema` definition has been removed from `useAddVocabularyTerm.ts`.
The hook now imports `AddTermSchema` from `@/lib/schemas` and passes it directly to
`zodResolver`. `AddTermValues` is typed as `AddTermSchema` (the exported type alias, which
is `z.infer<typeof AddTermSchema>`).

`AddTermSchema` in `schemas.ts` has been extended with `aliases: z.string().optional()`,
overriding the shared `AddVocabularyTermRequest`'s `aliases: z.array(z.string()).optional()`.
This follows the established `MetadataEditSchema` pattern for array fields that are held as
comma-separated strings in the form layer. The `defaultValues` in the hook sets `aliases: ''`
(empty string), which is consistent with `z.string().optional()`.

### B-2: Three vacuous `toBeDefined()` assertions in `TermRelationshipsInput.browser.test.tsx`

**Resolved.**

All three occurrences have been replaced with falsifiable assertions:

- "Add control" test (previously lines 83–84): the two `toBeDefined()` calls are replaced
  with `.value === ''` checks — the inputs are cast to `HTMLInputElement` and their `.value`
  property is asserted to be an empty string. This confirms that a blank row was appended with
  the correct default state.
- "Remove control" test (previously line 100): replaced with
  `expect(screen.queryByLabelText(/Target term ID/i)).not.toBeNull()` — a `queryBy*`
  assertion that would fail if the element were absent, confirming the setup precondition
  before removal.

### S-1: `HTMLTextAreaElement` cast in `AddVocabularyTermForm.browser.test.tsx`

**Addressed.**

The cast has been replaced with `HTMLInputElement` at line 27, consistent with the other
fields in the test. This was a suggestion and was not required; the developer applied it.

---

## Schema consistency check

`schemas.test.ts` passes `aliases: 'The Farm, Home Place'` (a comma-separated string) to
`AddTermSchema.safeParse` in the "passes with all optional fields" test. This is consistent
with the `z.string().optional()` override in `schemas.ts`. The comment in the test accurately
explains the pattern: "split to string[] in onSubmit". No inconsistency found.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All three blocking findings from the first review have been correctly addressed. The schema
override is consistent with the established `MetadataEditSchema` pattern, the test assertions
are now falsifiable, and the suggestion was applied. No new issues were identified.

Task status set to `review_passed`.

The review is ready for the user to check.
