# Code Review — Backend Service — Chore 4: Replace implicit group membership with schema column

**Date**: 2026-03-30 10:22
**Task status at review**: in_review
**Files reviewed**:

- `apps/backend/src/db/migrations/20260303000007_add_group_name_to_documents.ts`
- `apps/backend/src/db/tables.ts`
- `apps/backend/src/services/ingestion.ts`
- `apps/backend/src/services/documents.ts`
- `apps/backend/src/db/migrations/__tests__/migrations.integration.test.ts`
- `apps/backend/src/routes/__tests__/ingestion.integration.test.ts`
- `apps/backend/src/routes/__tests__/documents.integration.test.ts`
- `apps/backend/src/routes/__tests__/curation.integration.test.ts`
- `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts`
- `apps/backend/src/startup/__tests__/uploadSweep.integration.test.ts`
- `apps/backend/src/startup/__tests__/ingestionSweep.integration.test.ts`

---

## Acceptance condition

**Stated condition**: `documents` table has a nullable `groupName` column; `addFileToRun`
queries `groupName` directly rather than using `description.startsWith`; migration added;
integration tests updated; `pnpm --filter backend test` passes.

**Condition type**: automated

**Result**: Met.

- Migration `20260303000007_add_group_name_to_documents.ts` adds a nullable `text` column
  `group_name` to the `documents` table with a correct `down` path (`dropColumn('group_name')`).
- `addFileToRun` in `services/ingestion.ts` now checks `d.groupName === fields.groupName`
  (line 386) rather than `d.description.startsWith(groupName)`. The `description.startsWith`
  convention is gone from the service entirely.
- `migrations.integration.test.ts` includes `group_name` in the required-columns list for the
  `documents` table (line 127).
- Two new tests in `ingestion.integration.test.ts` cover the changed behaviour:
  - Lines 463–503: group-validation test seeds a document with `groupName: 'Group A'` using
    the schema column directly, then asserts a 422 `group_validation_failed` response.
    Falsifiable: removing the `groupName` equality check in the service would produce 201.
  - Lines 505–525: persistence test calls the API with `groupName: 'Family Album'` in the
    multipart form, then reads the document row back and asserts `doc?.groupName === 'Family Album'`.
    Falsifiable: if the column were not written, the assertion would get `null` and fail.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

The migration is correct and follows the additive-only policy (ADR-029). The `down` path
drops the column cleanly. `tables.ts` adds `groupName: string | null` to both `DocumentRow`
and `DocumentInsert`, making it a required field — TypeScript will flag any `DocumentInsert`
call site that omits it. All eleven `db.documents.insert` call sites in the codebase were
checked; every one now supplies `groupName` explicitly. The new integration tests are
falsifiable. The two-tier testing rule (CR-007) is satisfied — coverage goes via supertest
through the full stack for the new tests, and the migration test is a direct DB inspection
using a raw Knex instance (the established pattern for that file).

Task status set to `review_passed`.

The review is ready for the user to check.
