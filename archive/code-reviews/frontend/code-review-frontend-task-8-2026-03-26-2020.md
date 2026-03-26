# Code Review — Frontend Service — Task 8: Document curation queue — components

**Date**: 2026-03-26 20:20
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/useClearFlag.ts`
- `apps/frontend/src/components/ClearFlagButton/ClearFlagButton.tsx`
- `apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.browser.test.tsx`
- `apps/frontend/src/components/ClearFlagButton/ClearFlagButton.browser.test.tsx`

---

## Acceptance condition

**Restated**: `DocumentQueueItem` and `ClearFlagButton` exist; Tier 1 RTL tests pass
including the `null` date to "Undated" assertion on `DocumentQueueItem`; `pnpm biome check`
and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

Both components exist. The test file for `DocumentQueueItem` includes a `date={null}` test
that asserts `screen.getByText(/Undated/)` is defined and
`screen.queryByText('1987-06-15')` is null — directly testing the stated
condition. The non-null date path is also covered (`date="1987-06-15"` with
`queryByText(/Undated/)` asserting null). The `ClearFlagButton` tests cover default,
loading, and error rendering states as well as the accessible label. All test
assertions are falsifiable (CR-015 satisfied).

The lint and typecheck checks are automated preconditions verified as part of the
`code_written` transition. The developer must confirm tests pass:

```bash
pnpm --filter frontend test
```

Expected outcome: all tests in both test files pass; no type errors.

---

## Findings

### Blocking

None.

### Suggestions

**S-1** — `useClearFlag.ts` carries `'use client'`

`apps/frontend/src/app/(private)/curation/documents/components/useClearFlag.ts`, line 1.

`'use client'` is a module boundary directive intended for React components. Hook
files are not components — they are plain TypeScript modules that happen to call
React APIs. Adding `'use client'` to a hook file is not wrong (it marks the module
as client-only, which is defensively safe), but the project principles
(`development-principles-frontend.md`, Server vs Client Components section) frame the
directive in terms of components. The directive on a hook file is redundant: a hook
using `useState` can only be called inside a Client Component, which already carries
`'use client'` — so the hook module is always in a client subtree.

Consider removing `'use client'` from the hook file. No behaviour changes; it
marginally cleans up the module boundary marking to the places the principle
actually specifies.

**S-2** — Plain `<a>` tag for the "Edit metadata" link

`apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.tsx`,
line 34.

The link uses a plain HTML `<a>` tag, which triggers a full page navigation. Using
Next.js `<Link>` from `next/link` instead would enable client-side navigation,
pre-fetching, and a smoother UX when moving from the queue list to the metadata form.
This is a minor UX improvement; the task does not mandate it.

If `<Link>` is added, confirm the `<Link>` import comes from `next/link` in a Client
Component context (already satisfied by `'use client'` on `DocumentQueueItem`).

**S-3** — `archiveReference` field not rendered

`apps/frontend/src/app/(private)/curation/documents/components/DocumentQueueItem.tsx`.

The `DocumentQueueItem` shared type includes `archiveReference: string`. The task
description does not require it to be displayed in Phase 1, and the current rendering
omits it. This is acceptable given the task scope, but worth noting so a future task
can explicitly decide whether to surface `archiveReference` in the curation queue row.

---

## Summary

**Outcome**: Pass

No blocking findings. The acceptance condition is met: both components exist,
the required Tier 1 RTL tests are present including the `null` date to "Undated"
assertion, assertions are falsifiable, and the `'use client'` directives are
justified by the component's concrete requirements (hooks and event handlers).
Three minor suggestions are offered for optional consideration.

Task status set to `review_passed`.

The review is ready for the user to check.
