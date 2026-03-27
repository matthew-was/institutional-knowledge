# Code Review — Frontend Service — Task 13: Vocabulary review queue — Hono routes, handler, request functions, and data fetching

**Date**: 2026-03-27 19:48
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/handlers/curationHandler.ts`
- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/src/app/(private)/curation/vocabulary/_hooks/useVocabularyQueue.ts`
- `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueList.tsx`
- `apps/frontend/src/app/(private)/curation/vocabulary/page.tsx`
- `apps/frontend/src/app/(private)/curation/vocabulary/_hooks/useVocabularyQueue.browser.test.tsx`
- `apps/frontend/src/components/AcceptCandidateButton/useAcceptCandidate.browser.test.tsx`
- `apps/frontend/src/components/RejectCandidateButton/useRejectCandidate.browser.test.tsx`
- `apps/frontend/server/__tests__/curation.vocabulary.test.ts`

Also consulted (from Task 12, to understand wiring context):

- `apps/frontend/src/components/AcceptCandidateButton/useAcceptCandidate.ts`
- `apps/frontend/src/components/RejectCandidateButton/useRejectCandidate.ts`
- `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueItem.tsx`

---

## Acceptance condition

**Stated condition**: Vocabulary queue page fetches and renders candidates on mount; accept and
reject each trigger queue re-fetch confirmed by Tier 2 hook tests; all Tier 2 tests pass;
`pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met (with one vacuous assertion noted as a finding — see Suggestions)

The vocabulary queue page is implemented and wired: `VocabularyQueuePage` calls
`useVocabularyQueue` (which uses `useSWR` on `/api/curation/vocabulary`) and renders
`VocabularyQueueList`, which passes an `onSuccess` callback to each `VocabularyQueueItem`.
The `onSuccess` callback calls `mutate()` to trigger a re-fetch.

The "accept triggers re-fetch" path is confirmed by
`useAcceptCandidate.browser.test.tsx` — the test "re-fetches the queue (calls onSuccess)
after a successful accept" (line 129) asserts `expect(onSuccess).toHaveBeenCalledOnce()`
after a successful POST. The same pattern is confirmed for reject in
`useRejectCandidate.browser.test.tsx` (line 119). Both are falsifiable — removing the
`{ onSuccess }` option from `useSWRMutation` would cause the assertion to fail.

Tier 2 custom server route tests in `curation.vocabulary.test.ts` cover the three routes
(GET, POST accept, POST reject) across 200, 404, 409, and 500 paths.

The `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` checks are reported
passing by the implementer.

---

## Findings

### Blocking

None.

### Suggestions

**1. Vacuous "exposes mutate" test assertion (CR-015)**

File: `apps/frontend/src/app/(private)/curation/vocabulary/_hooks/useVocabularyQueue.browser.test.tsx`, line 126

The assertion `expect(typeof result.current.mutate).toBe('function')` is vacuous. SWR
always returns a `mutate` function regardless of what the hook does; this assertion would
never fail unless `mutate` were omitted from the return value entirely. It does not confirm
that `mutate`, when called, triggers a re-fetch.

The re-fetch confirmation is adequately covered by the `useAcceptCandidate` and
`useRejectCandidate` tests (which assert `onSuccess` was called, and `onSuccess` calls
`mutate`). If the intent of this test is to confirm the hook exposes `mutate` for wiring
into `VocabularyQueueList`, a structural check that it is a function is the only thing
testable at the hook level without a full integration. The test is not harmful — it is
just low-value. Consider either removing it or replacing it with a test that confirms
`mutate()` triggers a second call to the MSW handler (demonstrating actual re-fetch
behaviour).

**2. File location divergence from task description (Plan Compliance)**

Files: `apps/frontend/server/requests/curation.ts`,
`apps/frontend/server/handlers/curationHandler.ts`,
`apps/frontend/server/routes/curation.ts`

The task description (Task 13) specified creating three new files:
`server/requests/vocabulary.ts`, `server/handlers/vocabularyHandler.ts`, and
`server/routes/vocabulary.ts`. The implementation instead extended the existing curation
files. The senior developer plan does not prescribe separate files — it groups all
curation operations under a single section — so this is a task-description-only divergence,
not a plan violation.

The consolidation is a pragmatic choice and does not affect correctness. The curation
files were already the natural home for these operations (same Express boundary, same
`CurationRequests` interface). The implementer should update the task description's file
list in the commit message or PR notes so the divergence is documented. No code change
is required.

**3. `mutate` type in `VocabularyQueueList` uses a narrower shape than the shared schema**

File: `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueList.tsx`, line 7
File: `apps/frontend/src/app/(private)/curation/vocabulary/_hooks/useVocabularyQueue.ts`, lines 16 and 21

The `fetcher` function in `useVocabularyQueue.ts` casts `res.json()` to
`{ candidates: VocabularyCandidateItem[] }`, discarding the `total`, `page`, and
`pageSize` fields that `VocabularyQueueResponse` (from `@institutional-knowledge/shared`)
includes. The `KeyedMutator` type flows from the fetcher's return type, so
`KeyedMutator<{ candidates: VocabularyCandidateItem[] }>` is internally consistent.

However, the fetcher silently drops three fields of the Express response without
validation. If the backend response fails to parse as expected, the cast succeeds
silently and callers see no indication of the discarded data. This is not a blocking
issue because pagination fields are not used by this task's UI, and the casting is
explicit. It is worth noting for when pagination is wired up: the fetcher should return
(and validate against) the full `VocabularyQueueResponse` type at that point, rather
than requiring a refactor of the `KeyedMutator` type.

---

## Summary

**Outcome**: Pass

No blocking findings. Three suggestions are recorded above: a low-value vacuous test
assertion (CR-015), a file location divergence from the task description only (not the
plan), and a narrower-than-contract fetcher cast that will need revisiting when pagination
is added.

Task status set to `review_passed`.

The review is ready for the user to check.
