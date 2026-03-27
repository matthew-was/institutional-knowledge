# Code Review — Frontend Service — Task 12: Vocabulary review queue — components

**Date**: 2026-03-27 11:57
**Task status at review**: in_review
**Round**: 2 (re-review after `changes_requested`)
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

## What changed since Round 1

The single blocking finding B-1 from the first review has been addressed.
`VocabularyQueueItem.browser.test.tsx` has been updated: all seven
`getBy*(…).toBeDefined()` assertions have been replaced with `.textContent` checks.
No other files were modified.

---

## Acceptance condition

**Stated condition**: `VocabularyQueueItem`, `AcceptCandidateButton`, and
`RejectCandidateButton` components exist; Tier 1 RTL tests pass; `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

All three components exist. The test file now uses falsifiable assertions throughout:

- Lines 39–41: `.textContent` contains `'Thornfield Farm'`
- Lines 47–49: `.textContent` contains `'Land Parcel / Field'`
- Lines 55: `.textContent` contains `'0.87'`
- Lines 61–63: `.textContent` contains `'N/A'`; `queryByText(/0\.87/)` is `null`
- Lines 69–71: `.textContent` contains `'Conveyance deed dated 1923'`
- Lines 77–79: `getByRole('button', { name: 'Accept term' }).textContent` is `'Accept'`
- Lines 85–87: `getByRole('button', { name: 'Reject term' }).textContent` is `'Reject'`

Each assertion would fail if the corresponding rendering code were deleted or changed to
produce a different value. CR-015 is satisfied.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

The single blocking finding from Round 1 has been correctly resolved. All
`getBy*(…).toBeDefined()` assertions in `VocabularyQueueItem.browser.test.tsx` are now
falsifiable `.textContent` checks. No new issues were introduced. The `AcceptCandidateButton`
and `RejectCandidateButton` test files remain correct and unchanged.

Task status set to `review_passed`.

The review is ready for the user to check.
