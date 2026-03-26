# Code Review — Frontend Service — Task 9: Document curation queue — Hono route, handler, request functions, and data fetching

**Date**: 2026-03-26 21:10
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/handlers/curationHandler.ts`
- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/server/__tests__/curation.test.ts`
- `apps/frontend/src/app/(private)/curation/documents/page.tsx`
- `apps/frontend/src/app/(private)/curation/documents/_hooks/useDocumentQueue.ts`
- `apps/frontend/src/app/(private)/curation/documents/_hooks/useDocumentQueue.browser.test.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueList.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueList.browser.test.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/useClearFlag.ts`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.tsx` (modified)
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.browser.test.tsx` (modified)

## Acceptance condition

**Stated condition**: Document queue page fetches and renders items on mount; clear-flag triggers
re-fetch of queue confirmed by Tier 2 hook test; all Tier 2 tests pass; `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Not met

The Tier 2 custom server route handler tests are present and cover the stated route behaviours
(`GET /api/curation/documents` and `POST /api/curation/documents/:id/clear-flag`) in
`apps/frontend/server/__tests__/curation.test.ts`. The `useDocumentQueue` hook is tested with
`renderHook` + MSW in `useDocumentQueue.browser.test.tsx` and includes a test confirming that
`mutate` is exposed for revalidation. The `DocumentQueueList.browser.test.tsx` covers the
clear-flag trigger and subsequent `mutate()` call.

However, the acceptance condition is not fully met because of a blocking violation in
`useClearFlag.ts` (see Blocking finding 1 below). The condition requires "all Tier 2 tests
pass" — those tests will pass — but a blocking principle violation means the implementation
cannot advance as written. The acceptance condition cannot be marked met while a blocking
finding is open.

**Manual verification**: The developer must confirm that `pnpm biome check apps/frontend/src`
and `pnpm --filter frontend exec tsc --noEmit` pass once the blocking findings are resolved.

## Findings

### Blocking

**Blocking 1 — `useClearFlag` calls `fetchWrapper` directly, bypassing `useSWRMutation`**

`apps/frontend/src/app/(private)/curation/documents/components/useClearFlag.ts` — lines 13–25

`useClearFlag` is a custom hook that performs a POST mutation. It calls `fetchWrapper` directly
with `{ method: 'POST' }` and manages its own loading and error state with `useState`. This
bypasses `useSWRMutation`, which is the required mechanism for mutations in browser-side hooks.

The "Frontend Framework Agnosticism" section of `development-principles-frontend.md` is
explicit: "No plain `fetch` calls in hooks — all requests go through useSWR/useSWRMutation for
consistency." The anti-pattern table lists "Plain `fetch` calls inside a custom hook (bypassing
useSWR/useSWRMutation)" as a prohibited pattern.

`fetchWrapper` is documented as a "thin project utility wrapping plain `fetch`". Calling it
directly inside a hook is functionally identical to calling `fetch` directly — it bypasses the
caching, deduplication, and revalidation guarantees that `useSWRMutation` provides.

What must change: rewrite `useClearFlag` to use `useSWRMutation` with `fetchWrapper` as the
fetcher argument. The `isClearing` state and the `error` state should be derived from the
`isMutating` and `error` values returned by `useSWRMutation`, rather than managed with
`useState` directly. The `onSuccess` callback should be invoked from the `useSWRMutation`
`onSuccess` option or after `trigger()` resolves successfully.

Note on the task description conflict: Task 9 instructs the implementer to "replace the inline
no-op stub with a direct call to `clearDocumentFlag` (from `server/requests/curation.ts`)".
Importing from `server/` into a file under `src/` violates the Frontend Sub-system Boundary
principle — files under `src/` must not import directly from `server/` via relative paths
(`development-principles-frontend.md`, "Frontend sub-system boundary" section). The implementer
correctly avoided this import. The fix is `useSWRMutation` wrapping `fetchWrapper` — not an
import from `server/`. The task description should be updated to reflect this.

---

**Blocking 2 — `DocumentQueueList` carries an unnecessary `'use client'` directive**

`apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueList.tsx` — line 1

`DocumentQueueList` has `'use client'` at the top of the file. Checking against the CR-016
criteria:

- No `useState` or `useReducer` — it has none.
- No `useEffect` or `useLayoutEffect` — it has none.
- No browser APIs (`window`, `document`, `localStorage`) — it has none.
- No event handlers attached to DOM elements — the `onSuccess` callback it defines is passed
  as a prop to `DocumentQueueItem`, not attached to a DOM element directly by this component.
- No third-party library requiring `'use client'` — `swr` (`KeyedMutator`) is only used here
  as a type import; `DocumentQueueList` does not call `useSWR` or `useSWRMutation`.

None of the five reasons for `'use client'` apply to `DocumentQueueList`. The component is a
pure rendering layer — it maps `items` to `DocumentQueueItem` elements and passes a callback
prop. `page.tsx` already carries `'use client'` (legitimately, because it calls
`useDocumentQueue`), so `DocumentQueueList` is already in a client component subtree and does
not need its own directive.

Per CR-016: adding `'use client'` to a presentational component that has no state, effects,
browser APIs, or event handlers on DOM elements is a blocking finding. The directive must be
removed.

---

### Suggestions

**Suggestion 1 — `fetchQueue` stub in `CurationRequests` is dead code and creates a
confusing duplicate**

`apps/frontend/server/requests/curation.ts` — lines 41–47 (interface), lines 95–100 (implementation)

The `fetchQueue` method was pre-existing (introduced in Task 2) with an `'not_implemented'`
stub. Task 9 added `fetchDocumentQueue` as the real implementation of the same contract
(DOC-006). The `fetchQueue` stub now carries the comment "legacy stub — kept for
forward-compat with later tasks", but no later task in `frontend-tasks.md` references
`fetchQueue` by name. Both the interface member and the implementation throw `'not_implemented'`
and have no call sites.

The two methods have the same documented purpose (DOC-006, `GET api/curation/documents`),
which will confuse future implementers. The stub should be removed from both the interface and
the implementation when it is confirmed that no later task depends on it. This is out of scope
for Task 9 to fix (it predates this task), but it is worth noting as a follow-up cleanup item.

---

**Suggestion 2 — `NaN` risk in query param coercion in `GET /api/curation/documents` route**

`apps/frontend/server/routes/curation.ts` — lines 36–39

```typescript
const params = {
  ...(page !== undefined ? { page: Number(page) } : {}),
  ...(pageSize !== undefined ? { pageSize: Number(pageSize) } : {}),
};
```

If a caller supplies `?page=abc`, `Number('abc')` evaluates to `NaN`. `NaN` is then passed to
`fetchDocumentQueueHandler` and forwarded to Express as a query param (Ky serialises `NaN` to
the string `'NaN'`). Express will reject or silently ignore it, but the error from Express will
surface as a generic 500 from the Hono route rather than a meaningful 400.

Consider validating that `page` and `pageSize` are numeric strings before coercing them (e.g.
`/^\d+$/.test(page)`) and returning 400 if they are not. Phase 1 has a single user so the
risk is low, but the handler is accepting unvalidated input at a public API boundary.

---

**Suggestion 3 — `mutate().catch(() => undefined)` discards errors silently**

`apps/frontend/src/app/(private)/curation/documents/page.tsx` — line 21
`apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueList.tsx` — line 20

Both the retry button in `page.tsx` and the `onSuccess` callback in `DocumentQueueList` call
`mutate().catch(() => undefined)`. If `mutate()` rejects (e.g. the re-fetch itself fails after
a successful flag clear), the error is silently discarded. The user cleared the flag
successfully but the queue does not update visually, and no error message is shown.

A refinement would be to surface the `mutate()` rejection through `useDocumentQueue`'s `error`
state and display an error message. Not required for Phase 1, but worth noting.

---

## Summary

**Outcome**: Fail

Two blocking findings:

1. `useClearFlag` calls `fetchWrapper` directly instead of using `useSWRMutation`, violating
   the Frontend Framework Agnosticism principle ("No plain `fetch` calls in hooks"). The hook
   must be rewritten to use `useSWRMutation`. Note: the task description contains a conflicting
   instruction (import from `server/`); the task description should be updated to reflect the
   correct approach (`useSWRMutation` with `fetchWrapper`) before the task is re-reviewed.
2. `DocumentQueueList` has an unnecessary `'use client'` directive. The component is a pure
   rendering layer with no hooks, state, effects, or browser APIs. The directive must be
   removed per CR-016.

The review is ready for the user to check.
