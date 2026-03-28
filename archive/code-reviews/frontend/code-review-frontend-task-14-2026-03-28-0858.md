# Code Review — Frontend Service — Task 14: Manual vocabulary term entry — components and page

**Date**: 2026-03-28 08:58
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/components/TermRelationshipsInput/TermRelationshipsInput.tsx`
- `apps/frontend/src/components/TermRelationshipsInput/TermRelationshipsInput.browser.test.tsx`
- `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.ts`
- `apps/frontend/src/components/AddVocabularyTermForm/AddVocabularyTermForm.tsx`
- `apps/frontend/src/components/AddVocabularyTermForm/AddVocabularyTermForm.browser.test.tsx`
- `apps/frontend/src/app/(private)/curation/vocabulary/new/page.tsx`
- `apps/frontend/src/components/AcceptCandidateButton/AcceptCandidateButton.tsx`
- `apps/frontend/src/components/RejectCandidateButton/RejectCandidateButton.tsx`
- `apps/frontend/src/components/ClearFlagButton/ClearFlagButton.tsx`
- `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.tsx`

---

## Acceptance condition

The acceptance condition is: `AddVocabularyTermForm` and `TermRelationshipsInput` exist; Tier 1
RTL tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Not met

Both components exist and `AddVocabularyTermForm.browser.test.tsx` contains clean assertions.
However, `TermRelationshipsInput.browser.test.tsx` contains vacuous `toBeDefined()` assertions
that violate CR-015 (see Blocking finding 2). Tests that trivially pass regardless of the
code under test do not constitute passing tests for the purposes of the acceptance condition.

---

## Findings

### Blocking

#### B-1 — `AddTermFormSchema` is a duplicate form schema that diverges from `AddTermSchema`

**File**: `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.ts`, lines 16–29

The hook defines a local `AddTermFormSchema` instead of importing and using `AddTermSchema`
from `apps/frontend/src/lib/schemas.ts`.

This violates two principles:

1. **Plan compliance**: the plan explicitly states `AddVocabularyTermForm` validates with
   `AddTermSchema` (from Task 3). Task 3 created `AddTermSchema` in `src/lib/schemas.ts`
   precisely for this purpose.

2. **Single definition rule** (`development-principles.md` §7): "Types and constants shared
   across components must have a single definition." `AddTermFormSchema` and `AddTermSchema`
   are two definitions of overlapping schemas for the same form. If `AddTermSchema` is
   updated in `schemas.ts` (e.g. `term` gains `.trim()`), the hook's local copy will not
   pick up the change.

The reason for the local definition appears to be that `AddTermSchema` (inherited from the
shared `AddVocabularyTermRequest`) has `aliases: z.array(z.string()).optional()`, whereas
the form needs `aliases: z.string()` (comma-separated user input). This is a legitimate
form-layer concern — but the correct fix is to extend `AddTermSchema` in `schemas.ts` to
override `aliases`, following the established `MetadataEditSchema` pattern (which overrides
array fields to comma-separated strings for the same reason). The form schema must live in
`schemas.ts`; the hook imports from there.

**What must change**: remove `AddTermFormSchema` from `useAddVocabularyTerm.ts`. Extend
`AddTermSchema` in `apps/frontend/src/lib/schemas.ts` to override `aliases` with
`z.string()` (matching the form's working representation). Import and use that updated
`AddTermSchema` as the `zodResolver` argument in the hook. Update `AddTermValues` to be
`z.infer<typeof AddTermSchema>` (importing from `schemas.ts`).

---

#### B-2 — CR-015 violations in `TermRelationshipsInput.browser.test.tsx`

**File**: `apps/frontend/src/components/TermRelationshipsInput/TermRelationshipsInput.browser.test.tsx`

Three assertions use `expect(screen.getByLabelText(...)).toBeDefined()`. All `getBy*` RTL
queries throw on absence — they never return `undefined`. Therefore `.toBeDefined()` is
unconditionally true and provides no regression protection. This is the explicit pattern
named in CR-015.

**Specific occurrences**:

- Line 83: `expect(screen.getByLabelText(/Target term ID/i)).toBeDefined()`
- Line 84: `expect(screen.getByLabelText(/Relationship type/i)).toBeDefined()`
- Line 100: `expect(screen.getByLabelText(/Target term ID/i)).toBeDefined()`

For lines 83–84 (the "add control" test): after clicking "Add relationship", the assertion
should confirm the newly added row has the correct default state — e.g. assert
`(input as HTMLInputElement).value === ''` to confirm a blank row was appended, not just
that something matching the label exists.

For line 100 (the "remove control" test): this is a setup assertion checking the entry
exists before removal. The equivalent using `queryBy*` (which returns `null` on absence)
and asserting `not.toBeNull()` would be falsifiable; or simply remove it — the subsequent
removal and `queryBy*` assertion is the meaningful check.

**What must change**: replace all three `expect(screen.getByLabelText(...)).toBeDefined()`
assertions with falsifiable ones. Assert `.value`, an attribute, or use `queryBy*` +
`.not.toBeNull()` as appropriate.

---

### Suggestions

#### S-1 — `AddVocabularyTermForm.browser.test.tsx`: description field cast to `HTMLTextAreaElement` is unnecessary

**File**: `apps/frontend/src/components/AddVocabularyTermForm/AddVocabularyTermForm.browser.test.tsx`, line 29

```tsx
const descInput = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
expect(descInput.value).toBe('');
```

The cast to `HTMLTextAreaElement` works and is not incorrect, but `.value` is defined on
`HTMLInputElement` and `HTMLTextAreaElement` alike and RTL's `getByLabelText` returns
`HTMLElement`. Casting to `HTMLInputElement` (consistent with the other fields) or reading
`descInput.value` via a type cast to `HTMLInputElement & HTMLTextAreaElement` are both
acceptable. Minor — no functional impact.

#### S-2 — `useAddVocabularyTerm.ts`: `useSWRMutation` is not present despite the task description referencing it

**File**: `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.ts`, lines 58–67

The stub in `onSubmit` uses `useState` for `serverError` / `successMessage` directly, with
a comment noting `useSWRMutation` will be wired in Task 15. This is an intentional stub and
is acceptable for this task (Task 14 explicitly defers the API call to Task 15). The comment
is clear. No action required — noted for Task 15 review.

---

## Summary

**Outcome**: Fail

Two blocking findings:

- **B-1**: `AddTermFormSchema` is a duplicate schema definition that bypasses `AddTermSchema`
  in `schemas.ts`. The hook must import the canonical form schema from `schemas.ts`; the
  `aliases` field override belongs there, following the `MetadataEditSchema` pattern.
- **B-2**: Three `expect(screen.getByLabelText(...)).toBeDefined()` assertions in
  `TermRelationshipsInput.browser.test.tsx` are vacuous (CR-015). The acceptance condition
  requires tests to pass in a meaningful sense; vacuous assertions do not satisfy it.

Task status set to `review_failed`.

The review is ready for the user to check.
