# Code Review — Backend Service — ADR-048: Zod-to-OpenAPI Contract Pipeline

**Date**: 2026-03-13 22:58
**Task status at review**: Pre-Task-8 scaffold (not a numbered task — reviewed as an
ADR-048 implementation drop)
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
- `documentation/approvals.md`
- `documentation/decisions/architecture-decisions.md`
- `documentation/decisions/zod-openapi-migration-summary.md`
- `documentation/project/architecture.md`
- `documentation/tasks/backend-tasks.md`
- `documentation/tasks/integration-lead-contracts.md`
- `documentation/tasks/python-tasks.md`

## Acceptance condition

This is a pre-task scaffold drop, not a numbered task with a formal acceptance condition.
The stated definition of done from the implementation plan (Step 5 in
`zod-openapi-migration-summary.md`) is:

> `curl http://localhost:3001/openapi.json` returns a valid OpenAPI document. TypeScript
> build passes. Task 8 may begin.

This review treats that as the acceptance condition. It is a **manual** condition.

**Result**: Partially met — the code is structurally correct and would produce a valid spec
at runtime, but the `builder` Dockerfile stage has a missing `COPY tsconfig.json ./`
instruction that would cause the production build to fail (see Blocking finding B-001).
The TypeScript build cannot be confirmed to pass in the Docker production path until that
is fixed. The dev path (`devdeps` stage and local `pnpm build`) is unaffected.

**Manual verification steps** (run after B-001 is resolved):

1. Start the backend: `docker compose -f apps/backend/docker-compose.yml up`
2. Confirm the spec endpoint: `curl http://localhost:4000/openapi.json | python3 -m json.tool`
   — the response must be a valid JSON object with `openapi`, `info`, `paths`, and
   `components` keys.
3. Confirm the spec is unauthenticated: run the same `curl` without an `x-internal-key`
   header — it must return 200 (not 401).
4. Confirm the health check is still reachable: `curl http://localhost:4000/api/health`
   — must return `{"status":"ok","timestamp":"..."}`.
5. Confirm the TypeScript build passes:
   `pnpm --filter @institutional-knowledge/shared build`
   `pnpm --filter backend build`

## Findings

### Blocking

**B-001 — `builder` stage missing root `tsconfig.json` copy**

File: `apps/backend/Dockerfile`, line 40–48

The `builder` stage extends from `deps` (not `devdeps`) and copies `packages/shared/`
directly:

```dockerfile
FROM deps AS builder
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @institutional-knowledge/shared build
```

`packages/shared/tsconfig.json` extends `../../tsconfig.json` (the root TypeScript config
at `/app/tsconfig.json` inside the container). The `deps` stage does not copy the root
`tsconfig.json`, and neither does the `builder` stage. The `devdeps` stage does include
`COPY tsconfig.json ./` (line 35), which is why the dev-hot-reload path works. Without
the root `tsconfig.json`, the `pnpm --filter @institutional-knowledge/shared build` command
in `builder` will fail with a TypeScript "cannot read config file" error, making the
production Docker image unbuildable.

The same `COPY tsconfig.json ./` line that appears in `devdeps` must be added to the
`builder` stage before the shared package build step.

Also note: `apps/backend/tsconfig.json` also extends `../../tsconfig.json`, so the
`pnpm --filter backend build` step that follows would also fail for the same reason.

---

### Suggestions

**S-001 — Deprecated `z.string().uuid()` used inconsistently across schema files**

Files: `packages/shared/src/schemas/documents.ts` (multiple lines — e.g. lines 49, 65,
83, 106, 153, 188, 224, 277); `apps/backend/src/openapi.ts` (inline path-param schemas,
e.g. lines 127, 157, 184, 316–319, 342–345, 498–501, 526–529, 550–553)

The context brief for this review states that Zod v4's correct standalone UUID type is
`z.uuid()` (which replaces the deprecated `z.string().uuid()`). The newer schema files
(`vocabulary.ts`, `processing.ts`, `search.ts`, `ingestion.ts`) all use `z.uuid()`
correctly. `documents.ts` and the inline path-param schemas in `openapi.ts` use the
deprecated `z.string().uuid()` form.

`z.string().uuid()` still functions as a runtime validator in Zod v4 (it is a string
refinement, not removed), so this does not break anything today. The inconsistency is
worth resolving before Task 8 begins so that all handler-level schema authors have a clear
pattern to follow. Not blocking.

**S-002 — `@asteasolutions/zod-to-openapi` listed as a runtime dependency in `apps/backend`**

File: `apps/backend/package.json`, line 19

`@asteasolutions/zod-to-openapi` is listed under `dependencies` (runtime) in both
`apps/backend/package.json` and `packages/shared/package.json`. The backend uses it only
in `openapi.ts` to generate the spec at module load time. Because the spec is cached at
module load and served from memory, the library is a genuine runtime dependency for the
backend process. However, the `OpenAPIRegistry` and `OpenApiGeneratorV3` types are only
needed at spec-generation time — if spec generation were ever moved to a build step
(rather than runtime), it could become a dev dependency.

For the current architecture (runtime generation, cached), `dependencies` is technically
correct. This is raised as a suggestion in case the approach changes — no action needed now.

**S-003 — `zod-openapi-migration-summary.md` is a design-phase staging file**

File: `documentation/decisions/zod-openapi-migration-summary.md`

This file served its purpose: it was the design document that informed ADR-048 and the
implementation plan. Now that ADR-048 is approved and the scaffold is implemented, this
file has no ongoing operational value. Its "Status: Decision pending" heading is now
misleading. Consider moving it to `archive/previous-documentation/` or deleting it to
avoid confusing future readers. No action required before Task 8.

**S-004 — `builder` and `devdeps` stages both build `packages/shared` independently**

File: `apps/backend/Dockerfile`, lines 33–48

Both `devdeps` and `builder` extend from `deps` independently and each runs
`pnpm --filter @institutional-knowledge/shared build`. This is correct as multi-stage
builds require independent build graphs, but it means the shared package is compiled twice
in a typical CI run that builds both stages. An alternative would be to have `builder`
extend from `devdeps` rather than `deps` — it would reuse the compiled shared package from
the `devdeps` layer. Whether the Docker layer cache efficiency matters enough to restructure
is a judgement call. Not blocking.

**S-005 — `openapi.ts` return type is coupled to library internals**

File: `apps/backend/src/openapi.ts`, lines 594–598

```typescript
export function generateOpenApiSpec(): ReturnType<
  OpenApiGeneratorV3['generateDocument']
> {
  return cachedSpec;
}
```

The return type is expressed as `ReturnType<OpenApiGeneratorV3['generateDocument']>`,
which ties the public API signature of `generateOpenApiSpec` to the internals of
`@asteasolutions/zod-to-openapi`. If the library changes the return type of
`generateDocument` in a future major version, callers of `generateOpenApiSpec` would be
affected. A simple `object` or a locally-defined `OpenApiSpec` type alias would decouple
this. The current approach is readable and practically low-risk for a single caller
(`index.ts`), so this is a minor style note.

## Summary

**Outcome**: Fail

One blocking finding: the `builder` Dockerfile stage is missing `COPY tsconfig.json ./`,
which means the production Docker image cannot be built. The `devdeps` (dev hot-reload)
stage is not affected.

The schema files, `openapi.ts`, the `/openapi.json` route registration in `index.ts`,
the unauthenticated placement (before auth middleware), the sub-path exports in
`packages/shared/package.json`, the spec caching pattern, the `extendZodWithOpenApi`
placement (per-module, not in `openapi.ts`), the ESM import extensions, the documentation
updates (ADR-048, `backend-tasks.md` F-004, `python-tasks.md` Task 0,
`integration-lead-contracts.md` annotation), and the approval log entries are all correct.

Once B-001 is resolved, this drop is ready to proceed.
