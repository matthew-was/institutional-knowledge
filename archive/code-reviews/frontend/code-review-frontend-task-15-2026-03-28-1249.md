# Code Review — Frontend Service — Task 15: Manual vocabulary term entry — Hono route, handler, and request function

**Date**: 2026-03-28 12:49
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/handlers/curationHandler.ts`
- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.ts`
- `apps/frontend/server/__tests__/curation.vocabulary.test.ts`
- `apps/frontend/src/components/AddVocabularyTermForm/useAddVocabularyTerm.browser.test.tsx`

---

## Acceptance condition

**Condition type**: automated

> Add-term route implemented and returns 201; `targetTermId` validated with `z.uuid()` (not
> `z.string().uuid()`) confirmed by Tier 2 UI test; all Tier 2 tests pass; `pnpm biome check`
> and `pnpm --filter frontend tsc --noEmit` pass.

**Result**: Met

### Route returns 201

`server/routes/curation.ts` lines 230–276 implement `POST /vocabulary/terms`. On a successful
`addVocabularyTerm` call (outcome `success`) the route returns `c.json(result.data, 201)`.

The Tier 2 route test `curation.vocabulary.test.ts` lines 249–263 assert `res.status` equals
`201` and the response body matches the expected term data.

### `z.uuid()` (not `z.string().uuid()`)

`apps/frontend/src/lib/schemas.ts` line 117 uses `z.uuid()` directly (Zod v4 form) in the
`AddTermSchema` override for `relationships.targetTermId`.

`useAddVocabularyTerm.browser.test.tsx` lines 164–201 contain a dedicated describe block
`"useAddVocabularyTerm — targetTermId UUID validation"` with two tests:

- `"rejects a non-UUID targetTermId (confirms z.uuid() is used)"` — calls
  `AddTermSchema.safeParse` with `'not-a-uuid'` and asserts `result.success` is `false`.
  This is falsifiable: if `z.uuid()` were replaced with `z.string()`, the parse would
  succeed and the assertion would fail. CR-015 satisfied.
- `"accepts a valid UUID targetTermId"` — asserts `result.success` is `true` for a
  conforming UUID. Also falsifiable.

### 400 / 409 / 404 propagation

`curation.vocabulary.test.ts` covers the required error cases:

- `'400: returns invalid_params for missing required fields'` (lines 265–273)
- `'409: propagates duplicate_term from Express'` (lines 275–295)
- `'404: propagates not_found from Express (unknown targetTermId)'` (lines 297–327)

All cases assert both the HTTP status code and the structured error body.

---

## Findings

### Blocking

None.

### Suggestions

**1. `server/routes/curation.ts` — `'use client'` not applicable here (informational only)**

No suggestion on this file; the route file is server-only Hono code. Noted only to confirm
CR-016 does not apply to custom server files.

**2. `useAddVocabularyTerm.browser.test.tsx` — validation tests use `screen.getByText(...).textContent` equality check**

Lines 126–128 and 149–151:

```tsx
expect(
  screen.getByText('Too small: expected string to have >=1 characters')
    .textContent,
).toBe('Too small: expected string to have >=1 characters');
```

The assertion chains `screen.getByText(exactString).textContent` and then checks the same
string via `.toBe(...)`. Because `getByText` already requires an exact content match, the
`.textContent` check adds no additional coverage — it will pass for any element whose full
text content equals the search string. This is not a CR-015 violation (the presence of the
text node itself is meaningful regression coverage and `getByText` would throw if the error
message string were absent), but the double-reference reads redundantly.

A leaner form would be `expect(screen.getByText(...)).toBeInTheDocument()` with
`@testing-library/jest-dom`, or simply asserting the element exists with `getByText` without
chaining `.textContent`. Not blocking — the tests provide genuine coverage.

---

## Summary

**Outcome**: Pass

No blocking findings. The acceptance condition is fully met:

- `POST /api/curation/vocabulary/terms` returns 201 on success with the correct response body.
- `z.uuid()` (Zod v4 form, no `z.string()` wrapper) is used in `AddTermSchema` and confirmed
  by a Tier 2 UI test that would fail if the validator were weakened.
- 400, 409, and 404 error paths are all covered by Tier 2 route tests.
- The validation tests fixed in this re-review assert exact Zod error message text — they are
  falsifiable and satisfy CR-015.
- Handler factory pattern, `ServiceResult` pattern, exhaustive `ERROR_STATUS` record, and
  framework agnosticism constraints are all respected.

Task status set to `review_passed`.

The review is ready for the user to check.
