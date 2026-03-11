# Code Review — Backend Service — Task 6 Refactor: Typed repositories, camelCase conversion, async createDb

**Date**: 2026-03-11 11:37
**Task status at review**: done (Task 6 is done; this review covers a refactor commit on top of it)
**Commit reviewed**: HEAD on `feature/backend-task-6` — "Refactor db layer: typed repositories, camelCase conversion, async createDb"
**Files reviewed**:

- `apps/backend/src/db/__tests__/utils.test.ts` (new)
- `apps/backend/src/db/index.ts` (modified)
- `apps/backend/src/db/repositories/chunks.ts` (new)
- `apps/backend/src/db/repositories/embeddings.ts` (new)
- `apps/backend/src/db/repositories/index.ts` (new)
- `apps/backend/src/db/tables.ts` (new)
- `apps/backend/src/db/utils.ts` (new)
- `apps/backend/src/graphstore/PostgresGraphStore.ts` (modified)
- `apps/backend/src/index.ts` (modified)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (modified)
- `apps/backend/src/server.ts` (modified)
- `apps/backend/src/vectorstore/PgVectorStore.ts` (modified)
- `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts` (modified)
- `apps/backend/src/vectorstore/index.ts` (modified)

## Acceptance condition

Task 6's acceptance condition: integration tests against a real PostgreSQL instance confirm:
(a) `write` + `search` round-trip
(b) dimension mismatch throws a descriptive error
(c) topK limiting — 5 embeddings, topK=3 returns exactly 3 results
(d) empty database search returns an empty array

**Condition type**: automated

**Result**: Met

The integration tests in `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts` cover all four conditions. The refactor moved database access into repositories but did not change the observable behaviour of `PgVectorStore.write()` or `PgVectorStore.search()`. All test assertions remain unchanged and valid.

## Findings

### Blocking

**B-001 — `createGraphStore` factory signature diverges from the plan**

`apps/backend/src/graphstore/PostgresGraphStore.ts`, line 74:

```typescript
export function createGraphStore(provider: string, db: DbInstance): GraphStore {
```

The backend plan (`integration-lead-backend-plan.md`, GraphStore factory section) specifies:

> `createGraphStore(graphConfig, knex, log)` reads `graphConfig.provider` and returns a `PostgresGraphStore` instance for `"postgresql"`. Accepts the `AppConfig['graph']` config slice and a `Logger`, consistent with the factory pattern established by `createStorageService` and `createVectorStore`.

The current signature accepts a raw `string` (provider) rather than the `AppConfig['graph']` config slice, and omits the `Logger` parameter entirely. `server.ts` line 65 calls it as `createGraphStore(config.graph.provider, db)`, confirming the raw string usage.

This diverges from both the plan and the established factory pattern (`createStorageService`, `createVectorStore` both accept typed config slices and a `Logger`). This is also a plan deviation that may affect Task 7 (which adds the full `PostgresGraphStore` implementation) — Task 7 will need to wire logging inside the store and that `log` parameter must be available via the factory.

The caller must decide: update the plan to accept the current signature, or update the implementation to match the plan. If the plan is correct, `server.ts` must also be updated to pass `config.graph` and `log` rather than `config.graph.provider`.

---

**B-002 — `createDb` migration extension mismatch: `.js` config does not resolve `.ts` source files at test time**

`apps/backend/src/db/index.ts`, lines 55–59:

```typescript
migrations: {
  directory: path.join(__dirname, 'migrations'),
  extension: 'js',
},
```

The migration files in the repository are all `.ts` files (six files under `src/db/migrations/*.ts`). No compiled `.js` migration files exist in the source tree. At test time, Vitest runs TypeScript directly; `__dirname` resolves to `src/db/`, so `createDb`'s `migrate.latest()` call looks for `.js` files in `src/db/migrations/` and finds none. The call silently completes without applying any migrations.

Tests pass today only because `globalSetup.ts` runs `migrate.latest()` separately with `extension: 'ts'` before any test file executes — establishing the schema first. Any test that instantiates `createDb` without the global setup in place (e.g. an isolated test run against a blank database) would have no schema.

In production, TypeScript is compiled to `dist/` before execution, and `__dirname` resolves to `dist/db/`, where `.js` migration files do exist. Production is correct. The problem is specific to the test environment.

The `createDb` function must either:

- Accept the migration extension as a parameter so the caller can pass `'ts'` in tests and `'js'` in production, or
- Use a strategy that works for both environments (e.g. loading extensions by detecting the runtime, or delegating migration management out of `createDb` entirely so only `globalSetup.ts` runs migrations in tests)

This is a latent correctness issue: it does not cause test failures today because of `globalSetup.ts`, but it means `createDb`'s documented contract ("runs `migrate.latest()`") is only true in production.

---

### Suggestions

**S-001 — `as unknown as SearchResult[]` double cast can be narrowed**

`apps/backend/src/db/repositories/embeddings.ts`, line 73:

```typescript
) as unknown as SearchResult[];
```

The double cast (`as unknown as T`) bypasses TypeScript's structural type checking. The `Object.fromEntries` call on line 70 produces `Record<string, unknown>[]`, which is structurally incompatible with `SearchResult[]`. A cleaner approach is to map each row to an explicit object literal with fields extracted by name, which makes the shape visible to the type checker and eliminates the cast. This also makes it immediately obvious if a new field is added to `SearchResult` without updating the mapping.

Not blocking because the manual `camelCase` conversion is correct and the mapping produces the right shape at runtime; the cast is the only way to satisfy TypeScript given the current structure.

**S-002 — `createDb` is called in `beforeAll` after `globalSetup` already ran `migrate.latest()`**

`apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`, line 56:

```typescript
db = await createDb({ host: 'localhost', port: 5433, ... });
```

`createDb` internally calls `migrate.latest()` (line 82 of `db/index.ts`). `globalSetup.ts` already called `migrate.latest()` before any test file runs. The second call is a no-op (migrations are idempotent) but is redundant. Separately, as noted in B-002, the second `migrate.latest()` is effectively doing nothing in the test environment because it looks for `.js` migration files.

If B-002 is resolved by moving migration responsibility out of `createDb` for the test context, this suggestion becomes moot.

**S-003 — `postProcessResponse` applies camelCase conversion to all result objects unconditionally**

`apps/backend/src/db/index.ts`, line 68:

```typescript
postProcessResponse: (result: unknown) => { ... }
```

The function applies `camelCase` conversion to any object returned by Knex, including non-row results such as the result of `knex.raw('SELECT 1')` (line 81). `SELECT 1` returns `{ rows: [{ '?column?': 1 }] }` from the pg driver; applying `camelCase` to `'?column?'` produces `'?column?'` unchanged. In practice the only place this matters is the connectivity check, and the result is discarded. However, if a future Knex call relies on specific metadata fields from the raw result (e.g. `rowCount`, `command`), those field names would be unintentionally camelCase'd (they are already camelCase, so the transformation would be a no-op; but a key like `row_count` would be changed). The risk is low in practice.

**S-004 — Redundant `as string` cast in `camelCase`**

`apps/backend/src/db/utils.ts`, line 40:

```typescript
(char as string).toUpperCase(),
```

The `char` parameter is the second capture group from the regex replacement callback `(_, char: string)` and is already typed as `string` by the explicit parameter annotation. The `as string` cast is a no-op and adds noise. Minor style point only.

## Summary

**Outcome**: Fail

Two blocking findings:

- **B-001**: `createGraphStore` factory signature accepts a raw `string` provider argument rather than the `AppConfig['graph']` config slice and `Logger` specified by the plan. This is a plan deviation that will need resolving before Task 7 wires logging into `PostgresGraphStore`. The developer must decide whether to update the implementation to match the plan or update the plan to reflect the current signature.

- **B-002**: `createDb` is configured with `extension: 'js'` for migrations, but migration source files are `.ts` files. In the test environment (Vitest running TypeScript directly), `createDb`'s internal `migrate.latest()` call finds no files and runs no migrations. Tests pass today only because `globalSetup.ts` sets up the schema independently. The documented contract of `createDb` ("runs `migrate.latest()`") is not upheld at test time.

Task 6 itself is `done` and the acceptance condition for Task 6 is met. These findings concern the refactor code quality, not the Task 6 acceptance condition directly. The developer should return this refactor commit to `in_progress` for the two blocking findings to be resolved before the branch is merged.
