# Code Review — Backend Service — Task 13: Implement search handlers (QUERY-001, QUERY-002)

**Date**: 2026-03-19 09:33
**Task status at review**: code_complete
**Review round**: 2 (re-review of suggestion fixes after round 1 pass)
**Files reviewed**:

- `apps/backend/src/config/index.ts` — `maxTraversalDepth` added to graph config section
- `apps/backend/config.json5` — `maxTraversalDepth: 3` added under `graph` key
- `apps/backend/src/testing/testHelpers.ts` — `maxTraversalDepth: 3` added to `makeConfig()`
- `apps/backend/src/middleware/__tests__/middleware.test.ts` — `maxTraversalDepth: 3` added to inline stub config
- `packages/shared/src/schemas/search.ts` — `.max(5)` removed from `GraphSearchRequest.maxDepth`
- `apps/backend/src/services/search.ts` — `depth_exceeded` error type added; guard added in `graphSearch`
- `apps/backend/src/routes/search.ts` — `depth_exceeded: 400` added to `ERROR_STATUS`
- `apps/backend/src/routes/__tests__/search.integration.test.ts` — comment corrected; depth_exceeded test added

---

## Scope

This is a re-review covering only the three suggestions from the round 1 review:

- **S-001**: `maxDepth` upper bound hardcoded in Zod schema rather than config-driven — now resolved via ADR-049
- **S-002**: Test file header comment misidentified the auth key label — now corrected
- **S-003**: Null date substitution in `PostgresGraphStore.findDocumentsByEntity` — pre-existing, tracked for future fix; not addressed in this pass (acknowledged in scope notes)

The acceptance condition, all blocking findings (none in round 1), and all other review areas were confirmed satisfactory in round 1 and are not re-examined here.

---

## S-001 / ADR-049 fix: Config-driven traversal depth limit

**What was changed:**

1. `apps/backend/src/config/index.ts` line 91 — `maxTraversalDepth: z.number().int().min(1).default(3)` added to the `graph` config section. The Zod constraint is correctly `min(1)` with no upper bound; the ceiling is enforced at service level, not in the schema.

2. `apps/backend/config.json5` lines 59–62 — `"maxTraversalDepth": 3` added under the `graph` key with the surrounding keys unchanged. The value matches the ADR-049 default (3 hops).

3. `apps/backend/src/testing/testHelpers.ts` line 46 — `graph: { provider: 'postgresql', maxTraversalDepth: 3 }` — updated correctly; `makeConfig()` now satisfies the `AppConfig` type without a TypeScript cast.

4. `apps/backend/src/middleware/__tests__/middleware.test.ts` line 146 — `graph: { provider: 'postgresql', maxTraversalDepth: 3 }` — the inline stub config is consistent with the schema.

5. `packages/shared/src/schemas/search.ts` line 65 — `maxDepth: z.number().int().min(1)` — the `.max(5)` constraint has been removed. The schema now enforces only the minimum, consistent with ADR-049's requirement that the upper bound not be embedded in the shared contract.

6. `apps/backend/src/services/search.ts` lines 32, 108–114 — `'depth_exceeded'` added to `SearchErrorType`; guard at the top of `graphSearch` returns `{ outcome: 'error', errorType: 'depth_exceeded', errorMessage: ... }` when `maxDepth > config.graph.maxTraversalDepth`. The guard fires before any database access, which is correct.

7. `apps/backend/src/routes/search.ts` line 30 — `depth_exceeded: 400` added to the `ERROR_STATUS` record. The record remains exhaustive over `SearchErrorType` (`dimension_mismatch` and `depth_exceeded`).

8. `apps/backend/src/routes/__tests__/search.integration.test.ts` lines 312–321 — new test: `returns 400 when maxDepth exceeds the configured limit (depth_exceeded)`. It sends `maxDepth: 4` against a `makeConfig()` instance where `graph.maxTraversalDepth = 3`, asserts `res.status === 400` and `res.body.error === 'depth_exceeded'`. The test is a route integration test (supertest through the full stack). It correctly targets `maxDepth: 4` with `entityNames: ['John Smith']` — the depth guard fires before entity resolution, so no vocabulary seeding is required.

**Result**: Correctly implemented. Complies with ADR-049 and ADR-001 (Infrastructure as Configuration). No issues.

---

## S-002 fix: Test file header comment

**What was changed:**

`apps/backend/src/routes/__tests__/search.integration.test.ts` lines 11–13 — the header comment previously stated "Auth header uses the Python service key 'psk'". It now reads "Auth header uses the Python key 'pk' (from makeConfig()). Both 'fk' (frontend) and 'pk' (python) are valid keys in the auth middleware; QUERY-001 and QUERY-002 are called by Python so we use 'pk'."

The `AUTH` constant at line 52 (`{ 'x-internal-key': 'pk' }`) correctly uses `pythonKey` from `makeConfig()`. The comment now accurately describes the key being used and its source.

**Result**: Correctly fixed. Comment is accurate and informative.

---

## S-003 status

Pre-existing issue in `apps/backend/src/graphstore/PostgresGraphStore.ts` (`date: r.date ?? ''` in `findDocumentsByEntity`). Not addressed in this pass, as confirmed in the task notes. No further action expected here.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All three suggestions from the round 1 review have been correctly addressed. The S-001/ADR-049 fix is sound: the config field, default value, Zod schema change, service guard, route status mapping, and integration test are all consistent and correctly implemented. The S-002 comment correction is accurate. S-003 remains a known pre-existing issue tracked for future work.

The task is ready to advance to `reviewed`.
