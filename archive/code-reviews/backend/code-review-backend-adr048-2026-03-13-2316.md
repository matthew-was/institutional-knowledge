# Code Review — Backend Service — ADR-048: Zod-to-OpenAPI Contract Pipeline (Round 3)

**Date**: 2026-03-13 23:16
**Task status at review**: Pre-Task-8 scaffold (not a numbered task — reviewed as an
ADR-048 implementation drop, round 3 follow-up)
**Files reviewed**:

- `apps/backend/Dockerfile`
- `apps/backend/docker-compose.yml`
- `apps/backend/package.json`
- `apps/backend/src/index.ts`
- `apps/backend/src/openapi.ts`
- `packages/shared/package.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas/admin.ts`
- `packages/shared/src/schemas/documents.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/schemas/ingestion.ts`
- `packages/shared/src/schemas/processing.ts`
- `packages/shared/src/schemas/search.ts`
- `packages/shared/src/schemas/vocabulary.ts`
- `pnpm-lock.yaml`
- `documentation/approvals.md`
- `documentation/decisions/architecture-decisions.md`
- `documentation/project/architecture.md`
- `documentation/tasks/backend-tasks.md`
- `documentation/tasks/integration-lead-contracts.md`
- `documentation/tasks/python-tasks.md`

**Prior rounds**: Round 1 (2026-03-13 22:27) — Fail. Round 2 (2026-03-13 22:58) — Fail
(B-001: `builder` Dockerfile stage missing `COPY tsconfig.json ./`; S-001: deprecated
`z.string().uuid()` usage; S-003: staging doc not archived; S-004: shared build duplicated
across stages).

## Acceptance condition

This is a pre-Task-8 scaffold drop, not a numbered task with a formal acceptance condition.
The definition of done is:

> `GET /openapi.json` returns a valid OpenAPI document. TypeScript build passes.
> Task 8 may begin.

This is a **manual** condition.

**Result**: Met — all prior blocking findings are resolved; the code is structurally correct
and would produce a valid spec at runtime.

**Manual verification steps** (for the developer to confirm before marking this drop closed):

1. Start the backend: `docker compose -f apps/backend/docker-compose.yml up`
2. Confirm the spec endpoint:
   `curl http://localhost:4000/openapi.json | python3 -m json.tool`
   The response must be a valid JSON object with `openapi`, `info`, `paths`, and
   `components` keys.
3. Confirm the spec is unauthenticated: run the same `curl` without an `x-internal-key`
   header — it must return 200 (not 401).
4. Confirm the health check is still reachable:
   `curl http://localhost:4000/api/health`
   Must return `{"status":"ok","timestamp":"..."}`.
5. Confirm the TypeScript builds pass:
   `pnpm --filter @institutional-knowledge/shared build`
   `pnpm --filter backend build`
6. Confirm the production Docker image builds successfully:
   `docker build -f apps/backend/Dockerfile --target runtime .`

## Findings

### Blocking

None.

### Suggestions

**S-001 — ING-001 missing 409 error response in OpenAPI spec**

File: `apps/backend/src/openapi.ts`, lines 459–477

The ING-001 contract document specifies a 409 response for "An ingestion run is already in
progress". The OpenAPI spec registers only `201` and `400` for the ING-001 path. The 409
case is missing from the registered path.

This is not blocking — omitting error responses from an OpenAPI spec is common practice and
the Python code-gen step will not need a Pydantic model for a 409 body. Worth noting so that
when Task 14 (ingestion handlers) is implemented, the spec is updated to match. Not required
before Task 8.

**S-002 — `generateOpenApiSpec` return type is intentional but undocumented as such**

File: `apps/backend/src/openapi.ts`, lines 578–582

The return type `ReturnType<OpenApiGeneratorV3['generateDocument']>` was raised as a
suggestion in round 2. The context brief for this round confirms it is intentional and not to
be changed. No action required. This note is included for completeness — the suggestion from
round 2 is acknowledged and consciously retained.

## Summary

**Outcome**: Pass

No blocking findings. The round 2 blocking finding (B-001: `builder` stage missing root
`tsconfig.json`) is resolved by having `builder` extend `devdeps` rather than `deps` —
`devdeps` already copies and uses `tsconfig.json`, so the `builder` stage inherits it
correctly. The `z.string().uuid()` migration (round 2 S-001) is fully applied — zero
instances remain across all schema files and `openapi.ts`. The staging document
(`zod-openapi-migration-summary.md`) has been moved to `archive/previous-documentation/`
(round 2 S-003 resolved). The shared build duplication (round 2 S-004) is resolved as a
by-product of the `builder`/`devdeps` restructure.

All schema files, the `openapi.ts` spec generator, the `/openapi.json` route registration
in `index.ts` (unauthenticated, before auth middleware), the sub-path exports in
`packages/shared/package.json`, the `extendZodWithOpenApi` placement (per-module), the ESM
`.js` import extensions, and the documentation updates are correct. The implementation is
ready for Task 8 to begin.
