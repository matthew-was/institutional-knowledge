# Code Review — Frontend Service — Task 7: Upload success page and UploadSuccessMessage component

**Date**: 2026-03-26 11:04
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/components/UploadSuccessMessage/UploadSuccessMessage.tsx`
- `apps/frontend/src/components/UploadSuccessMessage/UploadSuccessMessage.browser.test.tsx`
- `apps/frontend/src/app/(private)/upload/success/page.tsx`
- `documentation/process/development-principles-frontend.md` (new principle added)

---

## Acceptance condition

**Restatement**: `/upload/success` page exists; `UploadSuccessMessage` renders correctly with
a non-null date; renders "Undated" for `null` date confirmed by Tier 1 RTL test; `pnpm biome
check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

The three Tier 1 RTL tests cover all three cases named in the acceptance condition:

1. "renders description and archive reference" — passes a non-null date, asserts description
   and archive reference text are present.
2. "renders 'Undated' when date is null" — passes `date={null}`, asserts the string "Undated"
   is present.
3. "renders the date string when date is non-null" — passes a non-null date string, asserts
   the date text is present.

The `null`-to-"Undated" branch (`date ?? 'Undated'` in `UploadSuccessMessage.tsx`) is
directly exercised by test 2. All assertions use `screen.getByText` with a pattern; if the
component rendered nothing or the wrong value, `getByText` would throw. Assertions are
falsifiable (CR-015 satisfied).

The `/upload/success` page exists at
`src/app/(private)/upload/success/page.tsx`. The `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass conditions are stated as met by the caller and are
consistent with the implementation (no observable type errors in the reviewed code).

**Manual verification**: The caller must confirm both commands pass clean before the task
advances to `reviewed`:

```bash
pnpm --filter frontend exec biome check src
pnpm --filter frontend exec tsc --noEmit
```

---

## Findings

### Blocking

**1. Plan divergence — UploadSuccessMessage labelled as Client Component in the plan**

File: `apps/frontend/src/components/UploadSuccessMessage/UploadSuccessMessage.tsx`

The senior developer plan (`documentation/tasks/senior-developer-frontend-plan.md`, line 237)
labels `UploadSuccessMessage` explicitly as a **Client Component**. The implementation omits
`'use client'`, making it a Server Component.

The change is technically sound — the component has no state, no effects, no browser APIs,
and no event handlers, so the new "Server vs Client Components" principle in
`development-principles-frontend.md` supports the Server Component choice. However, the plan
has not been updated to reflect this divergence.

Per the review workflow: when the implementation diverges from the plan, the developer must
decide whether to update the plan or revert the code. The code is preferable here, but the
plan must be updated to remove the "Client Component" label before the task advances.

**Action required**: Update `documentation/tasks/senior-developer-frontend-plan.md` line 237
to read "Server Component" (or remove the label) to match the implementation.

---

### Suggestions

**S-1. `UploadSuccessMessage` does not render the date inside its own `<li>` element in a
way tests could isolate date from surrounding text**

File: `apps/frontend/src/components/UploadSuccessMessage/UploadSuccessMessage.tsx`, lines 19

The rendered output is `<li>Date: {displayDate}</li>`, which means `getByText(/1972-03-15/)`
in test 3 matches the text "Date: 1972-03-15" (the regex matches a substring). This works, but
if the date were wrapped in a `<time>` element it would both be semantically richer and easier
to assert precisely. Not required — the current markup passes the acceptance condition — but
worth considering in a future polish pass.

**S-2. Success page does not guard against empty `description` or `archiveReference`**

File: `apps/frontend/src/app/(private)/upload/success/page.tsx`, lines 13–18

If the query string is absent or malformed (e.g. a user navigates directly to
`/upload/success`), `description` and `archiveReference` fall back to `''` (empty string) and
are rendered as empty. This produces a confusing confirmation page with blank fields. A guard
that redirects to `/upload` when the required params are missing would improve robustness. Not
blocking — Phase 1 is deliberately unpolished and the redirect requires a `notFound()` or
`redirect()` import, which is a small addition — but worth noting.

**S-3. `documentId` query param is passed but never consumed on the success page**

Files: `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts` (line 82),
`apps/frontend/src/app/(private)/upload/success/page.tsx`

The hook puts `documentId` in the query string (`params.documentId = body.documentId`) but the
success page never reads it. This is not a bug — the page does not need the ID to render the
confirmation — but the unused param adds minor noise. If there is no planned use of `documentId`
on the success page (e.g. a link to the document detail), consider removing it from the
`URLSearchParams` construction in the hook to keep the query string minimal.

---

## Summary

**Outcome**: Fail

One blocking finding: the plan labels `UploadSuccessMessage` as a Client Component but the
implementation correctly makes it a Server Component, and the plan has not been updated to
reflect this. The implementation is sound; only the plan must be synchronised before the task
can advance.

The review is ready for the user to check.
