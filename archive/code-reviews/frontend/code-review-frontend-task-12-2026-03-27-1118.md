# Code Review — Frontend Service — Task 12: Vocabulary review queue — components

**Date**: 2026-03-27 11:18
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueItem.tsx`
- `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueItem.browser.test.tsx`
- `apps/frontend/src/components/AcceptCandidateButton/AcceptCandidateButton.tsx`
- `apps/frontend/src/components/AcceptCandidateButton/useAcceptCandidate.ts`
- `apps/frontend/src/components/AcceptCandidateButton/AcceptCandidateButton.browser.test.tsx`
- `apps/frontend/src/components/RejectCandidateButton/RejectCandidateButton.tsx`
- `apps/frontend/src/components/RejectCandidateButton/useRejectCandidate.ts`
- `apps/frontend/src/components/RejectCandidateButton/RejectCandidateButton.browser.test.tsx`

---

## Acceptance condition

**Stated condition**: `VocabularyQueueItem`, `AcceptCandidateButton`, and
`RejectCandidateButton` components exist; Tier 1 RTL tests pass; `pnpm biome check
apps/frontend/src` and `pnpm --filter frontend exec tsc --noEmit` pass.

**Condition type**: automated

**Result**: Not met

All three components exist. However, the `VocabularyQueueItem` test file contains eight
assertions that use `getByText(...)` or `getByRole(...)` followed by `.toBeDefined()`.
The `getByText` and `getByRole` queries throw when the element is absent, which means
`.toBeDefined()` is always true regardless of what the component renders. These assertions
provide no regression protection — they would pass even if the rendering code were
deleted entirely.

This is a blocking finding under CR-015.

The `AcceptCandidateButton` and `RejectCandidateButton` test files do not have this
problem: they use `.toBe(false)`, `.toBe(true)`, `.toBe('Accept')`,
`.toBe('Accepting…')`, `.toBe(...)` on `textContent`, and `toBeNull()` on `queryByRole`.
All assertions are falsifiable.

---

## Findings

### Blocking

**B-1 — Vacuous `toBeDefined()` assertions in `VocabularyQueueItem.browser.test.tsx`
(CR-015)**

File: `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueItem.browser.test.tsx`

Eight assertions pair a throwing query (`getByText` / `getByRole`) with `.toBeDefined()`.
`getByText` and `getByRole` throw if the element is not found; they never return
`undefined`. So `.toBeDefined()` is unconditionally true — the assertion passes whether
the element is present or absent, and whether the text content is correct or not.

Affected lines:

- Line 39: `expect(screen.getByText(/Thornfield Farm/)).toBeDefined()`
- Line 45: `expect(screen.getByText(/Land Parcel \/ Field/)).toBeDefined()`
- Line 51: `expect(screen.getByText(/0\.87/)).toBeDefined()`
- Line 57: `expect(screen.getByText(/N\/A/)).toBeDefined()`
- Line 65: `expect(screen.getByText(/Conveyance deed dated 1923/)).toBeDefined()`
- Line 71: `expect(screen.getByRole('button', { name: 'Accept term' })).toBeDefined()`
- Line 77: `expect(screen.getByRole('button', { name: 'Reject term' })).toBeDefined()`

Note: line 59 (`expect(screen.queryByText(/0\.87/)).toBeNull()`) is correct — it uses
`queryByText` which returns `null` on absence, making the assertion falsifiable.

What must change: replace each `.toBeDefined()` assertion with one that checks a
meaningful property of the element — for text assertions, assert `.textContent` contains
the expected value; for button assertions, assert a property of the button such as
`(button as HTMLButtonElement).disabled` or `.textContent`. For example:

```tsx
// Instead of:
expect(screen.getByText(/Thornfield Farm/)).toBeDefined();

// Assert a falsifiable property:
expect(screen.getByText(/Thornfield Farm/).textContent).toContain('Thornfield Farm');
```

For the button tests, a pattern already used correctly in `AcceptCandidateButton.browser.test.tsx`
is the model: assert `.textContent` or `.disabled` after `getByRole`.

### Suggestions

None.

---

## Summary

**Outcome**: Fail

Eight assertions in `VocabularyQueueItem.browser.test.tsx` use the `getByRole` /
`getByText` + `toBeDefined()` anti-pattern. These are vacuous — they provide no
regression protection and would pass if the rendering code were removed. The
`AcceptCandidateButton` and `RejectCandidateButton` test files are well-structured
and use falsifiable assertions throughout; they are not affected by this finding.

No other blocking issues were found. The component architecture is correct: state
lives in hooks, `'use client'` is justified on both button components (event handlers,
`useSWRMutation`), `VocabularyQueueItem` has no `'use client'` directive and correctly
delegates to Client Component children, the SWR keys match the routes Task 13 will
register, and props align with `VocabularyCandidateItem` from `@institutional-knowledge/shared`.

Task status set to `review_failed`.

The review is ready for the user to check.
