# Code Review — Frontend Service — Task 11: Document detail — Hono routes, handler, and request functions

**Date**: 2026-03-27 09:17
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/handlers/curationHandler.ts`
- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/src/components/DocumentMetadataForm/useDocumentMetadata.ts`
- `apps/frontend/src/lib/schemas.ts`
- `apps/frontend/src/lib/__tests__/schemas.test.ts`
- `apps/frontend/server/__tests__/curation.documents.test.ts`
- `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.tsx`
- `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.browser.test.tsx`

---

## Acceptance condition

**Condition**: Metadata PATCH sends correctly structured request body with array fields split
from comma-separated input confirmed by Tier 2 UI test; null date handled without error; all
Tier 2 tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Result**: Met

**Array splitting confirmed by Tier 2 UI test**: `DocumentMetadataForm.browser.test.tsx`
"sends PATCH with array fields correctly split" (lines 172–209) renders the form with
`people: ['Alice Smith', 'Bob Jones']` (pre-populated as `'Alice Smith, Bob Jones'` in the
form), submits, intercepts the PATCH at the Hono boundary, and asserts
`body.people` equals `['Alice Smith', 'Bob Jones']`. The `capturedBody` pattern captures the
actual request the hook sends — if `splitCommaString` were removed, `body.people` would be
the raw comma-separated string `'Alice Smith, Bob Jones'`, failing `Array.isArray(body.people)`.
Falsifiable per CR-015.

**Null date handled without error**: two independent tests confirm this — the Tier 1
"renders with an empty date field when document date is null" (lines 61–69) asserts
`dateInput.value === ''` and no error text; the Tier 2 "does not show a validation error on
initial render with null date" (lines 213–220) confirms the same in the stateful hook context.
Both are falsifiable: removing the `date: document.date ?? ''` mapping in `toFormValues`
would cause the input to hold `null`, failing the `''` assertion.

**All Tier 2 tests pass**: confirmed by the developer's `pnpm --filter frontend test` report
(136 tests passing). The Tier 2 custom server route tests in `curation.documents.test.ts`
cover GET 200, GET 404, GET 500, PATCH 200, PATCH 400 (Express-propagated), PATCH 400
(Hono-level Zod validation), and PATCH 404.

**Lint and type check**: confirmed by the developer's completion checklist.

---

## Findings

### Blocking

None.

### Suggestions

**S-1**: `apps/frontend/src/components/DocumentMetadataForm/DocumentMetadataForm.browser.test.tsx`,
line 203 — weak assertion in "sends PATCH with array fields correctly split"

The `waitFor` block at line 202–204 asserts:

```typescript
await waitFor(() => {
  expect(screen.getByRole('status')).toBeDefined();
});
```

`screen.getByRole('status')` already throws if the element is absent, making `toBeDefined()`
unconditionally true when the element exists. The assertion does not verify the content of
the status element. The primary AC assertion (`body.people`) that follows is correctly
falsifiable and covers the splitting behaviour. The suggestion is to tighten the `waitFor`
assertion to match the content — consistent with the success message test in the
"save success" describe block (line 115: `textContent).toBe('Changes saved successfully.')`):

```typescript
await waitFor(() => {
  expect(screen.getByRole('status').textContent).toBe('Changes saved successfully.');
});
```

This is a suggestion, not blocking: the `body.people` assertion that follows is the load-bearing
check for the acceptance condition and is fully falsifiable.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation correctly wires the two new Hono routes for
document detail fetch and metadata update. The request functions, handler, and route handler
follow the three-layer pattern. The `z.preprocess` removal and `splitCommaString` approach
cleanly resolves the type cast issue noted in the implementation notes. The
`MetadataEditSchema` is now a straightforward `z.object` with no transformation, satisfying
the schema placement principles. All required tests are present and the primary
acceptance condition assertions are falsifiable.

Task status set to `review_passed`.

The review is ready for the user to check.
