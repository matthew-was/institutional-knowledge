# Code Review — Frontend Service — Task 10: Document detail page and metadata edit form — components

**Date**: 2026-03-27 06:46
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/app/(private)/curation/documents/[id]/page.tsx`
- `apps/frontend/src/components/MetadataEditFields/MetadataEditFields.tsx`
- `apps/frontend/src/components/MetadataEditFields/MetadataEditFields.browser.test.tsx`
- `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.tsx`
- `apps/frontend/src/components/DocumentMetadataForm/useDocumentMetadata.ts`
- `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.browser.test.tsx`

Supporting files read: `apps/frontend/src/lib/config.ts`, `apps/frontend/src/lib/schemas.ts`,
`apps/frontend/server/config/index.ts`, `apps/frontend/next.config.ts`,
`apps/frontend/config.json5`

---

## Acceptance condition

> Document detail page fetches document server-side; form renders pre-populated fields;
> null date pre-population does not trigger validation error confirmed by Tier 1 RTL test;
> `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Not met

**Details**:

The RTL tests covering null date pre-population are present and correct.

- `DocumentMetadataForm.browser.test.tsx` — "renders with an empty date field when document date
  is null": renders `{ ...baseDocument, date: null }`, asserts `dateInput.value === ''` and
  no error text visible. This is falsifiable (CR-015): it would fail if `toFormValues` did not
  map `null` → `''`, or if the form treated an empty default as a validation error on render.
- `MetadataEditFields.browser.test.tsx` — "renders the date field as empty with no error when
  initial date is empty string": tests the form-internal representation `date: ''` and asserts
  the same invariant.

`pnpm biome check` passes (no issues on the six reviewed files).
`pnpm --filter frontend exec tsc --noEmit` passes.
All 129 frontend tests pass.

However, there is one blocking finding related to a hardcoded hostname in the document detail
page (see Blocking section below). This constitutes a violation of the Infrastructure as
Configuration principle and is flagged as blocking. The acceptance condition is not met until
that finding is resolved.

---

## Findings

### Blocking

**B-01 — Hardcoded `localhost` hostname in page self-call**

File: `apps/frontend/src/app/(private)/curation/documents/[id]/page.tsx`, line 13

```typescript
const url = `http://localhost:${config.server.port}/api/curation/documents/${id}`;
```

The hostname `localhost` is hardcoded. The port is correctly sourced from config, but the
host is not. When the frontend runs inside a Docker container (as it will during integration
and in deployment), the container's own address may not be `localhost` — this URL would fail
to resolve, causing the Server Component to return a network error on every document detail
page load.

The Infrastructure as Configuration principle (and the "no hardcoded endpoint URLs" rule)
requires that all configurable values, including a service's own base URL for self-calls, be
loaded from config. The fix must add a `server.baseUrl` (or equivalent) entry to the config
schema and `config.json5` defaults, and replace the hardcoded `http://localhost:` prefix with
the config value.

---

### Suggestions

**S-01 — `description` field uses `<Input>` (text) instead of `<textarea>`**

File: `apps/frontend/src/components/MetadataEditFields/MetadataEditFields.tsx`, lines 39–56

The plan specifies: "description uses a `<textarea>`." The implementation uses
`<Input type="text">`. This is a divergence from the plan. A `<textarea>` is appropriate for
a document description that may be multi-line. The divergence is not a security or correctness
issue, and Phase 1 is deliberately unpolished (UR-119), so this is raised as a suggestion
rather than blocking. The developer should decide whether to update the plan to match the
implementation or update the implementation to use a `<textarea>`.

**S-02 — Redundant `'use client'` on `useDocumentMetadata.ts`**

File: `apps/frontend/src/components/DocumentMetadataForm/useDocumentMetadata.ts`, line 1

The `'use client'` directive on a hook file is unusual. The hook uses `useState`, which is
a valid client-side concern, but the directive on the hook file itself is redundant: the hook
is only called from `DocumentMetadataForm`, which is already marked `'use client'`. The hook
inherits the client boundary from its caller. Removing the directive from the hook file would
be consistent with the pattern used elsewhere in the codebase (e.g. `useClearFlag.ts` and
`useDocumentQueue.ts` do not carry `'use client'`). This is not a CR-016 violation (the hook
file is not a component), but it is an inconsistency worth noting.

---

## Summary

**Outcome**: Fail

One blocking finding: the `localhost` hostname in the document detail page is hardcoded and
violates the Infrastructure as Configuration principle. The page will fail in Docker
environments where the container is not at `localhost`. This must be fixed before the task
can proceed to `review_passed`.

The review is ready for the user to check.
