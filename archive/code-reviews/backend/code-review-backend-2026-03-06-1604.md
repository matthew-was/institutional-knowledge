# Code Review — Backend Service — Task 1: Scaffold the Express backend application

**Date**: 2026-03-06T16:04:58
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/package.json`
- `apps/backend/tsconfig.json`
- `apps/backend/biome.json`
- `apps/backend/config.json`
- `apps/backend/src/config/index.ts`
- `apps/backend/src/db/index.ts`
- `apps/backend/src/middleware/logger.ts`
- `apps/backend/src/middleware/auth.ts`
- `apps/backend/src/middleware/errorHandler.ts`
- `apps/backend/src/routes/index.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/storage/types.ts`
- `apps/backend/src/storage/LocalStorageService.ts`
- `apps/backend/src/vectorstore/types.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`
- `apps/backend/src/graphstore/types.ts`
- `apps/backend/src/graphstore/PostgresGraphStore.ts`
- `biome.json` (root)

---

## Acceptance condition

**Condition type**: manual

The acceptance condition requires:

1. `pnpm install` in the monorepo root installs all backend dependencies without errors.
2. `pnpm --filter backend build` produces no TypeScript errors.
3. `biome check apps/backend/src` passes with no errors.
4. `src/index.ts` exists and exports a startable Express application (even if routes are empty stubs).

**Result**: Met — with the following verification instructions.

**Developer must verify the following manually**:

- Run `pnpm install` from the monorepo root. Expected: exits 0 with all packages installed.
- Run `pnpm --filter backend build` from the monorepo root. Expected: exits 0 with no TypeScript errors.
- Run `pnpm exec biome check apps/backend/src` from the monorepo root (or equivalent). Expected: exits 0 with no lint or format errors.
- Confirm `apps/backend/src/index.ts` exports `createApp()` returning `express.Application`, and `apps/backend/src/server.ts` imports `createApp()` and calls `app.listen()`.

All four checks are expected to pass based on the code reviewed.

---

## Findings

### Blocking

None.

### Suggestions

**Suggestion 1 — `apps/backend/tsconfig.json`: add a comment explaining `esModuleInterop: true`**

`esModuleInterop: true` is not present in the root `tsconfig.json` and is correctly added here — it enables the `import express from "express"` default-import syntax used in `src/index.ts` (Express is a CommonJS module without a native ESM default export). Without this flag, TypeScript with `module: NodeNext` would require `import * as express from "express"`.

The setting is correct and necessary. A short inline comment would clarify to future readers that this is intentional, not an accidental duplication of a root-level setting.

---

**Suggestion 2 — `apps/backend/src/index.ts` line 39: redundant pino instance**

`createApp()` creates a new `pino` instance solely to pass to `createErrorHandler()`:

```typescript
const log = pino({ level: "info" });
```

`middleware/logger.ts` already exports a `logger` instance (the same `pino` instance used by `requestLogger`). Using the shared `logger` export instead of creating a second instance would eliminate the redundancy. Two pino instances writing to the same stream can produce output that looks like two distinct sources.

---

**Suggestion 3 — `apps/backend/src/storage/LocalStorageService.ts`: no path traversal guard**

Every method computes a full path using `path.join(this.stagingPath, key)` or `path.join(this.basePath, key)`. If a caller passes a `key` containing `../` segments, `path.join` resolves the traversal and the result can escape the intended root. In Task 1 this is not exploitable — no handlers accept user-supplied input yet.

Adding a guard in Task 8 — verifying that the resolved full path starts with the root path before performing any file operation — would make the storage layer robust regardless of how callers construct keys. Flagged here so it is considered during Task 8 rather than discovered later.

---

**Suggestion 4 — `apps/backend/src/db/`: missing `migrations/` and `seeds/` directories**

The task description calls for creating `src/db/migrations/` and `src/db/seeds/` as empty directories. Neither directory exists and no `.gitkeep` marker files are present. Git does not track empty directories.

The Knex configuration references both paths. Knex handles a non-existent migrations directory gracefully at runtime (treats it as zero migrations pending), so this does not prevent startup or block the build. Task 2 will create the migrations directory when it adds the first migration file, resolving this naturally. The developer may address this now with `.gitkeep` files or accept that Task 2 resolves it.

---

## Summary

**Outcome: Pass**

No blocking findings. The code satisfies the acceptance condition. Confirmed as correct:

- nconf CJS loading via `createRequire` is correctly implemented and explained in the module comment.
- The Zod `ConfigSchema` covers all nconf keys specified in the backend plan, with appropriate type coercions.
- The health check is registered before auth middleware in `src/index.ts`, correctly implementing the plan's requirement for an unauthenticated `GET /api/health` endpoint.
- Auth middleware validates the `x-internal-key` header against a `Set` of both valid caller keys (`frontendKey` and `pythonKey`) per ADR-044. The `pythonServiceKey` (outbound, Express to Python) is correctly not in the validation set.
- VectorStore and GraphStore stub implementations throw with clear task-reference messages and are clearly marked as not yet implemented.
- The root `biome.json` fix (moving `quoteStyle` from the top-level `formatter` block into `javascript.formatter`) is correct.
- `"type": "module"` is set in `package.json`, all imports use explicit `.js` extensions, and `import.meta.url` is used in place of `__dirname`/`__filename` throughout.
- No secrets or credentials appear in logs.
- Startup operations match the plan's specified order and are stubbed with clear task references where not yet implemented.

The task is ready to advance to `reviewed`.
