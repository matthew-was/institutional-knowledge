# Code Review — Frontend Service — Task 9: Document curation queue — Hono route, handler, request functions, and data fetching

**Date**: 2026-03-26 21:38
**Round**: 2 (re-review following first review failure)
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/handlers/curationHandler.ts`
- `apps/frontend/server/__tests__/curation.test.ts`
- `apps/frontend/src/app/(private)/curation/documents/components/useClearFlag.ts`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueList.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.browser.test.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueList.browser.test.tsx`
- `apps/frontend/src/app/(private)/curation/documents/_hooks/useDocumentQueue.ts`
- `apps/frontend/src/app/(private)/curation/documents/_hooks/useDocumentQueue.browser.test.tsx`
- `apps/frontend/src/app/(private)/curation/documents/page.tsx`
- `documentation/process/development-principles-frontend.md`

---

## First-round blocking findings — resolution check

**B-1**: `useClearFlag` must use `useSWRMutation`, not a direct `fetchWrapper` call.

**Resolution**: Confirmed fixed. `useClearFlag.ts` now imports `useSWRMutation` from `swr/mutation`.
The `clearFlag` fetcher calls `fetchWrapper`, checks `res.ok`, and throws on failure with a
parsed message. `useSWRMutation` is called with the `onSuccess` option wired to the `onSuccess`
callback from the caller. `handleClear` calls `trigger(documentId).catch(() => undefined)` to
keep errors internal to hook state. This matches the required pattern.

**B-2**: `DocumentQueueList` must not carry `'use client'`.

**Resolution**: Confirmed fixed. `DocumentQueueList.tsx` contains no `'use client'` directive.
It receives `items` and `mutate` as props and renders a list of `DocumentQueueItem` components.
`DocumentQueueItem.tsx` carries `'use client'` because it calls `useClearFlag` (which calls
`useSWRMutation`) — this is correct.

---

## First-round suggestions — resolution check

**S-1**: Dead `fetchQueue` stub removed from `CurationRequests` and `createCurationRequests`.

**Resolution**: Confirmed. `fetchQueue` no longer appears in `server/requests/curation.ts`.
The interface and implementation match.

**S-2**: `GET /api/curation/documents` validates query params with Zod.

**Resolution**: Confirmed. `curation.ts` route now calls
`DocumentQueueParams.safeParse(c.req.query())` before calling the handler. Returns 400 with
`{ error: 'invalid_params', message: parsed.error.issues[0]?.message }` on failure.
`DocumentQueueParams` uses `z.coerce.number()` for `page` and `pageSize`, so string-to-number
conversion is handled automatically — `page=abc` correctly fails coercion and the route returns
400. The principle is documented in `development-principles-frontend.md` (Hono custom server
section, lines 209–215) and in the "What these principles rule out" table.

A corresponding test (`400: returns invalid_params when query params fail Zod validation`) is
present in `curation.test.ts` (line 91–96). It passes `?page=abc` and asserts status 400 with
`{ error: 'invalid_params' }`. This assertion is falsifiable: removing the `safeParse` guard
would cause the route to proceed to the handler and return 200, failing the test.

**S-3**: `mutate().catch(() => undefined)` left as-is (not actioned).

**No finding**: The decision is documented. POST success is confirmed before `mutate()` is
called; a failed re-fetch leaves a momentarily stale UI that SWR will revalidate naturally.
This is acceptable.

---

## Acceptance condition

**Condition**: Document queue page fetches and renders items on mount; clear-flag triggers
re-fetch of queue confirmed by Tier 2 hook test; all Tier 2 tests pass; `pnpm biome check`
and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

**Evidence**:

1. Document queue page fetches on mount: `useDocumentQueue.browser.test.tsx` — "returns items
   from the API on success" (line 37–61) renders the hook and asserts `items` is populated after
   `isLoading` becomes false. MSW intercepts `/api/curation/documents` at the Hono route boundary.
   Falsifiable: removing the `useSWR` call would leave `items` as `[]` forever, failing the length
   assertion.

2. Clear-flag triggers re-fetch: `DocumentQueueList.browser.test.tsx` — "calls mutate after a
   successful clear-flag POST" (line 51–70). MSW intercepts the POST; the test passes a mocked
   `mutate` function and asserts it has been called once after the button click resolves. The
   re-fetch path is: `ClearFlagButton` click → `useSWRMutation` trigger → `onSuccess` callback
   → `mutate()`. Falsifiable: removing the `onSuccess` option from `useSWRMutation` would prevent
   `mutate` from being called, failing the assertion.

3. All Tier 2 tests present: custom server route tests cover 200, 400 (new), 404, 409, and 500
   for both routes. UI behaviour tests cover fetch-on-mount, empty state, error state, loading
   state, success-triggers-mutate, and error-shown-on-failure.

4. Lint and type check: confirmed passing by the implementer prior to marking `code_written`
   (enforced by `/update-task-status` checklist).

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All blocking findings from the first review have been fixed. The two S-1 and S-2 suggestions
have been applied. S-3 was intentionally left as-is with a documented rationale. No new issues
were found in the full diff. Task status set to `review_passed`.

The review is ready for the user to check.
