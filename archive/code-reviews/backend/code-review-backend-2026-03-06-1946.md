# Code Review — Backend Service — Full Source Pass (post-B-001 fix)

**Date**: 2026-03-06 19:46
**Task status at review**: N/A — full source pass; Task 1 is `reviewed`. No subsequent tasks are `code_complete`.
**Scope**: All source files under `apps/backend/src/`, plus `config.json5`, `package.json`, `biome.json`, `tsconfig.json`
**Trigger**: Developer applied B-001 fix (shared logger in `server.ts`), upgraded Biome to 2.4.6, and reformatted all source files. Full pass requested to confirm no regressions and to close out S-001 through S-003 from the previous review.

**Files reviewed**:

- `apps/backend/src/server.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/config/index.ts`
- `apps/backend/src/db/index.ts`
- `apps/backend/src/middleware/logger.ts`
- `apps/backend/src/middleware/auth.ts`
- `apps/backend/src/middleware/errorHandler.ts`
- `apps/backend/src/routes/index.ts`
- `apps/backend/src/services/index.ts`
- `apps/backend/src/schemas/index.ts`
- `apps/backend/src/storage/types.ts`
- `apps/backend/src/storage/LocalStorageService.ts`
- `apps/backend/src/vectorstore/types.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`
- `apps/backend/src/graphstore/types.ts`
- `apps/backend/src/graphstore/PostgresGraphStore.ts`
- `apps/backend/config.json5`
- `apps/backend/tsconfig.json`
- `apps/backend/biome.json`
- `apps/backend/package.json`

---

## Previous blocking finding

**B-001 (from 2026-03-06-1853)** — `server.ts` private pino instance not updated to use shared logger.

**Status**: Resolved. `server.ts` now imports `logger` from `./middleware/logger.js` (line 21) and uses it throughout startup. No private pino instance exists anywhere in the codebase.

---

## Previous suggestions — status

**S-001** — Path traversal not guarded at the storage layer (`LocalStorageService.ts`).
Status: Still present; remains a valid suggestion. The keys are internally constructed today so there is no immediate vulnerability. Carried forward below as S-001.

**S-002** — Graceful shutdown has no connection-drain timeout (`server.ts`).
Status: Still present; carried forward below as S-002.

**S-003** — `nconf` typed as `any` suppresses call-site verification (`config/index.ts`).
Status: Still present; carried forward below as S-003.

---

## Acceptance condition

Task 1 is `reviewed`. Its acceptance condition (manual) was confirmed in a prior session. This pass does not re-verify the build — it focuses on code quality, correctness, security, ADR compliance, and plan compliance.

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — `LocalStorageService.ts`: path traversal not guarded at the storage layer**

File: `apps/backend/src/storage/LocalStorageService.ts`, all key-accepting methods.

Every method that receives a `key` parameter calls `path.join(root, key)` without verifying that the resolved path stays within the configured root. If a caller ever passes a key derived from user-supplied input (e.g. an original filename) without normalising it first, a relative segment such as `../../etc/passwd` would escape the configured root. Keys are currently constructed internally by handlers yet to be written (Tasks 8+), so there is no present vulnerability. When the upload and ingestion handlers are implemented, each one should either (a) verify keys before passing them to storage, or (b) the storage layer should verify that `path.resolve(root, key)` starts with `root + path.sep`. The storage layer is the safer place to enforce this invariant because it provides a single, unconditional guarantee that no implementation path can bypass. Raise this when implementing Tasks 8, 9, 10, 14.

**S-002 — `server.ts`: graceful shutdown has no drain timeout**

File: `apps/backend/src/server.ts`, lines 86–96.

`server.close()` stops accepting new connections and waits indefinitely for existing connections to complete before invoking the callback. Under container orchestrators (Docker Compose, future AWS ECS) that send SIGTERM and then SIGKILL after a fixed deadline, this means the Knex pool may not be destroyed if connections are held open past the orchestrator's kill timeout. Adding a `setTimeout` that calls `server.closeAllConnections()` (Node.js 18.2+, available here since `engines` requires Node 24) after a configurable drain deadline (e.g. 10 seconds) would make shutdown deterministic. Not blocking for Phase 1.

**S-003 — `config/index.ts`: `nconf` typed as `any`**

File: `apps/backend/src/config/index.ts`, lines 27–28.

The `biome-ignore` comment correctly explains why `any` is necessary here. A narrow inline interface exposing only the four chaining methods actually called (`argv`, `env`, `file`, `get`) would restore partial type safety without requiring a full type declaration for the `nconf` module. Not urgent given that the raw object is immediately validated by Zod at load time.

**S-004 — `config/index.ts`: `getConfig()` not exported; task spec requires it**

File: `apps/backend/src/config/index.ts`.

Task 3 acceptance condition specifies: "Export a `getConfig()` function that returns the validated config object, typed using the Zod inferred type." The current implementation exports a pre-evaluated `const config: AppConfig` singleton instead. Both approaches provide a typed, validated config object and both fail fast at module load time. The singleton export is strictly simpler — there is no lazy-initialisation concern because ESM modules execute on first import and the result is cached. The plan's `getConfig()` wording likely anticipated a lazy getter but the singleton pattern is superior here. This diverges from the task spec's stated export contract, but the practical difference is nil: every consumer can `import { config } from './config/index.js'` rather than `import { getConfig } from './config/index.js'; const cfg = getConfig()`. If Task 3's automated tests are written expecting a `getConfig()` export, they will fail to compile. The developer should decide whether to add a `getConfig()` alias or update Task 3's acceptance condition description to reflect the singleton pattern. Not blocking for Task 1.

**S-005 — `logger.ts`: logger level hardcoded to `'info'`**

File: `apps/backend/src/middleware/logger.ts`, line 14.

The backend plan specifies: "Logger level should be configurable (read from config or environment)." The `pino` instance is created with a hardcoded `level: 'info'` rather than reading from config. Because `logger` is instantiated as a module-level singleton during ESM module evaluation — before the rest of `server.ts` runs — it cannot read from the nconf singleton without a circular dependency. The practical workaround is to read `process.env.LOG_LEVEL` directly (falling back to `'info'`), which is consistent with the nconf hierarchy (environment variables are a valid config source). The current hardcode is not wrong for Phase 1, but the plan's configurable level requirement is not met. Raise this before Task 4 is marked complete.

---

## Plan compliance notes

The following observations are not findings but are noted for the record:

- **ESM compliance (ADR-047)**: All imports use explicit `.js` extensions. `import.meta.url` used correctly in `config/index.ts` and `db/index.ts`. `"type": "module"` present in `package.json`. No CommonJS patterns in source. Compliant.

- **ADR-044 (shared-key auth)**: `createAuthMiddleware` correctly validates against a `Set` of both `frontendKey` and `pythonKey`. The health check is registered before the auth middleware in `index.ts` and is correctly exempted. Compliant.

- **ADR-031 (Express sole DB writer)**: The Knex instance is created in `server.ts` and injected via `AppDependencies`. No component instantiates a database client independently. Compliant.

- **Infrastructure as Configuration**: `createStorageService`, `createVectorStore`, and `createGraphStore` all read a provider string from config and return the appropriate implementation. No hardcoded provider selection in application logic. Compliant.

- **Dependency injection**: `createApp` receives all dependencies as `AppDependencies`. `createAuthMiddleware` and `createErrorHandler` receive their dependencies as parameters. No global state accessed inside handlers. Compliant.

- **No secrets in logs**: `server.ts` logs `{ err }` objects (error metadata), never document content or credentials. Serialisers in `logger.ts` explicitly exclude request and response bodies. Compliant.

- **Biome configuration**: Root `biome.json` sets `"indentStyle": "space"` and `"quoteStyle": "single"` with `noExplicitAny: error` and `noUnusedVariables: error`. The backend-level `biome.json` extends the root. `@biomejs/biome` is removed from the backend `devDependencies` (now root-only). Consistent with the task spec.

- **`biome-ignore` suppression comments**: Both `PgVectorStore.ts` and `PostgresGraphStore.ts` have `biome-ignore lint/correctness/noUnusedPrivateClassMembers` annotations with explanatory comments on stub constructor parameters. Usage is appropriate and well-explained.

- **`knex` migration extension**: `db/index.ts` sets `extension: 'js'` for migrations and seeds. This is correct for the compiled output in `dist/`. The comment explains the rationale. Compliant.

- **`config.json5` passwords**: The `db.password` and auth keys in `config.json5` are clearly labelled local-development placeholders (`ik_local_dev`, `dev-frontend-key`, etc.). These match the Docker Compose local defaults documented in the project memory. No production secrets present.

---

## Summary

**Outcome**: Pass with suggestions

B-001 from the previous review is resolved. No new blocking findings. Five suggestions are carried forward or newly raised; none are required before the next task begins. The most actionable suggestion for the implementer to track is S-004 (the `getConfig()` vs `config` export divergence from the Task 3 spec), which should be resolved when Task 3 tests are written.
