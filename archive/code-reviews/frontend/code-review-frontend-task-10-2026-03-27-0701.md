# Code Review — Frontend Service — Task 10: Document detail page and metadata edit form — components

**Date**: 2026-03-27 07:01
**Task status at review**: in_review
**Round**: 2 (re-review after review_failed 2026-03-27-0646)

**Files reviewed**:

- `apps/frontend/src/app/(private)/curation/documents/[id]/page.tsx`
- `apps/frontend/src/components/MetadataEditFields/MetadataEditFields.tsx`
- `apps/frontend/src/components/MetadataEditFields/MetadataEditFields.browser.test.tsx`
- `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.tsx`
- `apps/frontend/src/components/DocumentMetadataForm/useDocumentMetadata.ts`
- `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.browser.test.tsx`

Supporting files read: `apps/frontend/src/lib/config.ts`,
`apps/frontend/src/lib/schemas.ts`, `apps/frontend/server/config/index.ts`,
`apps/frontend/next.config.ts`, `apps/frontend/config.json5`,
`packages/shared/src/schemas/documents.ts`

---

## Findings from round 1 — resolution status

**B-01 — Hardcoded `localhost` hostname**: resolved. The URL is now constructed as
`` `http://${config.server.host}:${config.server.port}/api/curation/documents/${id}` ``,
where both `host` and `port` come from the config singleton loaded via nconf. No hardcoded
hostname remains.

**S-01 — `description` field uses `<Input>` (text) instead of `<textarea>`**: resolved.
The description field now uses `<Field.Control render={<textarea />} ...>` — consistent
with the plan's specification.

**S-02 — Redundant `'use client'` on `useDocumentMetadata.ts`**: resolved. The directive
has been removed from the hook file. The hook is called only from `DocumentMetadataForm`
(which is `'use client'`), and the hook itself correctly omits the directive — consistent
with the pattern used across the codebase.

---

## Acceptance condition

> Document detail page fetches document server-side; form renders pre-populated fields;
> null date pre-population does not trigger validation error confirmed by Tier 1 RTL test;
> `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

**Details**:

- Document detail page (`page.tsx`) is an `async` React Server Component that fetches the
  document record in the page body using `fetch` against the Hono route
  `GET /api/curation/documents/:id`. Handles 404 and non-OK responses with error UI.
  Passes the document to `DocumentMetadataForm` as props.
- `DocumentMetadataForm` renders all six metadata fields pre-populated from the document
  prop, confirmed by the "renders all metadata fields pre-populated" test in
  `DocumentMetadataForm.browser.test.tsx`.
- Null date pre-population: `useDocumentMetadata.ts` maps `document.date ?? ''` to the
  form default. `DocumentMetadataForm.browser.test.tsx` — "renders with an empty date
  field when document date is null": renders with `{ ...baseDocument, date: null }`,
  asserts `dateInput.value === ''` and no error text visible. This is falsifiable (CR-015):
  it fails if `toFormValues` does not map `null → ''`, or if the form treats the empty
  default as a validation error on render. `MetadataEditFields.browser.test.tsx` — "renders
  the date field as empty with no error when initial date is empty string" covers the
  form-internal representation independently.
- `pnpm biome check` passes on the six reviewed files.
- `pnpm --filter frontend exec tsc --noEmit` passes.
- All 129 frontend tests pass (confirmed in round 1; no new test files added in round 2
  that would require re-running).

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All round-1 findings have been addressed:

- B-01 (hardcoded hostname): resolved via `config.server.host`.
- S-01 (textarea for description): resolved via `Field.Control render={<textarea />}`.
- S-02 (redundant `'use client'` on hook): resolved by removing the directive.

No new blocking or suggestion-level findings introduced by the changes. The acceptance
condition is met. Task status set to `review_passed`.

The review is ready for the user to check.
