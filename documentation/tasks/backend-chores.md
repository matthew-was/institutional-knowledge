# Backend Chores

Tidy-up tasks identified during implementation. These are not blocking any current frontend
or Python work and can be scheduled as capacity allows.

---

## Chore 1: Move `DocumentErrorType` to `packages/shared`

**Description**: `DocumentErrorType` is currently defined in
`apps/backend/src/services/documents.ts` and is not exported from `packages/shared`. The
frontend custom server (`apps/frontend/server/`) needs to reason about the same error type
strings when converting Express HTTP error responses to `ServiceResult` values in
`server/requests/documents.ts`. Until this chore is done, the frontend maintains a duplicate
string union.

Move `DocumentErrorType` to `packages/shared/src/` (e.g. `packages/shared/src/documentErrorType.ts`),
export it from `packages/shared/src/index.ts`, and update the backend import site in
`apps/backend/src/services/documents.ts` to import from `@institutional-knowledge/shared`.

**Depends on**: Frontend Task 6 (`server/requests/documents.ts` refactor) — so the frontend
import can be added in the same pass.

**Complexity**: S

**Acceptance condition**: `DocumentErrorType` is defined once in `packages/shared`;
`apps/backend/src/services/documents.ts` imports it from `@institutional-knowledge/shared`;
`apps/frontend/server/requests/documents.ts` imports it from `@institutional-knowledge/shared`;
`pnpm --filter backend exec tsc --noEmit` and `pnpm --filter frontend exec tsc --noEmit` both
pass.

**Condition type**: automated

**Status**: not_started

---

## Chore 2: Fix null `date` mapping in `PostgresGraphStore.findDocumentsByEntity`

**Description**: `PostgresGraphStore.findDocumentsByEntity` in
`apps/backend/src/graphstore/PostgresGraphStore.ts` maps a null `date` column to `''`
(empty string) instead of `null` on the returned `DocumentReference` objects. This is
inconsistent with the explicit-null principle added to `development-principles.md` during
the null-date audit (2026-03-22), which prohibits the `?? ''` anti-pattern for nullable
date fields.

Fix the mapping to return `null` when `date` is null. Update any affected tests.

**Depends on**: None

**Complexity**: S

**Acceptance condition**: `findDocumentsByEntity` returns `date: null` (not `date: ''`) when
the underlying document has no date; existing integration tests updated to assert `null`;
`pnpm --filter backend test` passes.

**Condition type**: automated

**Status**: not_started

---

## Chore 3: Migrate backend timestamps to `Temporal` (Phase 2)

**Description**: The backend uses `new Date()` / `.toISOString()` pervasively for DB
timestamp generation (`completedAt`, `flaggedAt`, `rejectedAt`, `updatedAt`) and Knex row
mapping. These are all instant/timestamp operations (not calendar date operations).

At Phase 2, migrate to `Temporal.Now.instant()` for timestamp generation and replace
`.toISOString()` calls with `Temporal.Instant` methods. This requires a decision on how
to handle the Knex boundary — Knex returns JS `Date` objects for `timestamp` columns —
either converting at the repository layer or via a Knex post-processor.

**Blocker**: Defer until Node 26 is adopted (native `Temporal` support without a polyfill)
or until the project is ready to tackle the repository layer changes. The frontend uses
`@js-temporal/polyfill` in Phase 1; the backend polyfill question is deferred to avoid
disrupting the established Knex timestamp pattern mid-implementation.

**Depends on**: Phase 2 planning; Node 26 adoption decision

**Complexity**: L

**Acceptance condition**: All `new Date()` / `.toISOString()` calls in timestamp-generation
contexts replaced with `Temporal.Now.instant()` equivalents; Knex boundary handled
consistently at the repository layer; all backend tests pass.

**Condition type**: automated

**Status**: not_started

---

## Chore 4: Replace implicit group membership with schema column (S-003)

**Description**: `addFileToRun` in `apps/backend/src/services/ingestion.ts` identifies group
membership by checking `d.description.startsWith(groupName)`. This is a fragile convention —
group membership is not schema-enforced and relies on a CLI naming pattern.

Add a `groupName` column to the `documents` table, update `addFileToRun` to query it
explicitly, and add a migration.

**Blocker**: Defer until Phase 1 CLI work is planned — the `groupName` column needs to be
populated by the CLI ingestion path, which is not yet designed.

**Depends on**: Phase 1 CLI planning

**Complexity**: M

**Acceptance condition**: `documents` table has a nullable `groupName` column;
`addFileToRun` queries `groupName` directly rather than using `description.startsWith`;
migration added; integration tests updated; `pnpm --filter backend test` passes.

**Condition type**: automated

**Status**: not_started
