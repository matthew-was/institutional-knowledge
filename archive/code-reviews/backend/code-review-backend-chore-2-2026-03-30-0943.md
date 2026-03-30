# Code Review — Backend Service — Chore 2: Fix null `date` mapping in `PostgresGraphStore.findDocumentsByEntity`

**Date**: 2026-03-30 09:43
**Task status at review**: in_review
**Files reviewed**:

- `apps/backend/src/graphstore/PostgresGraphStore.ts`
- `apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts`

---

## Acceptance condition

**Stated condition**: `findDocumentsByEntity` returns `date: null` (not `date: ''`) when the
underlying document has no date; existing integration tests updated to assert `null`;
`pnpm --filter backend test` passes.

**Condition type**: automated

**Result**: Met

The fix at `PostgresGraphStore.ts` line 216 changes `r.date ?? ''` to `r.date ?? null`.
Because `GraphDocumentRow` is `Pick<DocumentRow, 'id' | 'description' | 'date'>` and
`DocumentRow.date` is already typed `string | null`, the `?? null` expression is
redundant but harmless — the Knex result already carries `null` when the column is null.
The intent is clear and the explicit `?? null` guards against any future change to the
upstream type.

The new test at line 481 (`(e) returns date: null when document has no date`) inserts a
document via the `insertDocument` helper (which omits the `date` column, leaving it as
the DB default `null`), calls `findDocumentsByEntity`, and asserts `expect(ref.date).toBeNull()`.
This assertion is falsifiable: before the fix, the mapping returned `''`, which would fail
`toBeNull()`. CR-015 is satisfied.

The existing positive-date test at line 447 (`(e) returns DocumentReference with correct
description and date`) continues to assert `expect(ref.date).toBe('1962-06-15')`, providing
complementary coverage of the non-null path.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

The fix is minimal and correct. The production change (`?? ''` → `?? null`) aligns
`findDocumentsByEntity` with the explicit-null principle. The type chain from `DocumentRow`
through `GraphDocumentRow` to `DocumentReference` is consistent and already declares
`date: string | null`. The new test is falsifiable and directly targets the corrected
behaviour. No other issues found across the review checklist.

Task status set to `review_passed`.

The review is ready for the user to check.
