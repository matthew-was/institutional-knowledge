# Code Review — Backend Service — General Quality Pass (post-Task-1 changes)

**Date**: 2026-03-06T18:53:27
**Task status at review**: N/A — general quality pass; Task 1 is `reviewed`
**Files reviewed**:

- `apps/backend/src/server.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/config/index.ts`
- `apps/backend/src/db/index.ts`
- `apps/backend/src/middleware/logger.ts`
- `apps/backend/src/middleware/auth.ts`
- `apps/backend/src/middleware/errorHandler.ts`
- `apps/backend/src/routes/index.ts`
- `apps/backend/src/storage/types.ts`
- `apps/backend/src/storage/LocalStorageService.ts`
- `apps/backend/src/vectorstore/types.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`
- `apps/backend/src/graphstore/types.ts`
- `apps/backend/src/graphstore/PostgresGraphStore.ts`
- `apps/backend/config.json5`
- `apps/backend/tsconfig.json`
- `apps/backend/package.json`

## Context

This is a second-pass quality review triggered by three changes made after Task 1 was marked `reviewed`:

1. `src/index.ts` — removed a redundant private `pino` instance; now imports `logger` from `./middleware/logger.js`
2. `src/config/index.ts` — added `import JSON5 from 'json5'`; `.file()` calls now use `format: JSON5` and reference `config.json5` and `config.override.json5`
3. `apps/backend/config.json` renamed to `config.json5` with inline comments added

The review also addresses four specific focus questions raised by the caller.

## Focus area responses

### 1. ESM import of `json5` under NodeNext resolution

`import JSON5 from 'json5'` at `src/config/index.ts` line 23.

`json5` v2.2.3 has no `"exports"` field in its `package.json`. Under NodeNext module resolution,
Node.js falls back to `"main": "lib/index.js"`, which is a CommonJS module. With
`esModuleInterop: true` in `apps/backend/tsconfig.json`, TypeScript synthesises a default import
from the named exports, accepting `import JSON5 from 'json5'` and typing `JSON5` as
`{ parse, stringify }`. At runtime, Node.js ESM imports the CommonJS module and produces
`JSON5 = { parse, stringify }`.

**Verdict**: Works correctly at both compile time and runtime. No issue.

### 2. `json5` as a runtime dependency

`json5` is listed under `"dependencies"` in `apps/backend/package.json`. This is correct — it
is needed at runtime to parse `config.json5`.

**Verdict**: Correct placement. No issue.

### 3. nconf `.file()` format option interface

The nconf `IFormat` interface requires `{ stringify(obj, replacer, spacing): string; parse(str): any }`.
nconf calls `format.stringify(data, null, this.spacing)` when writing and
`this.format.parse(contents)` when reading. JSON5's `stringify(value, replacer, space)` accepts
a `null` replacer and numeric spacing; `parse(text)` matches the read signature. The interfaces
are fully compatible.

**Verdict**: No issue.

### 4. `server.ts` private pino instance

Confirmed — see blocking finding B-001 below.

## Findings

### Blocking

**B-001 — `server.ts`: private pino instance not updated to use the shared logger**

File: `apps/backend/src/server.ts`, lines 17 and 25.

`server.ts` imports `pino` directly (line 17) and creates `const log = pino({ level: "info" })`
(line 25). The equivalent issue in `index.ts` was fixed — `index.ts` now imports `logger` from
`./middleware/logger.js`. That fix was not applied to `server.ts`.

At runtime two separate pino instances coexist: the shared `logger` (used by `requestLogger` and
the error handler) and the private `log` (used for all startup-phase messages). Log entries from
database connectivity checks, migration runs, and the server listen confirmation go through a
different instance than HTTP request and error logs. Any configuration applied to the shared
`logger` — log level changes, transport setup, destination streams — will not affect startup
logging.

What must change: remove `import { pino } from "pino"` and `const log = pino({ level: "info" })`
from `server.ts`. Import `logger` from `./middleware/logger.js` and replace all uses of `log`
with `logger`.

### Suggestions

**S-001 — `LocalStorageService.ts`: path traversal not guarded at the storage layer**

File: `apps/backend/src/storage/LocalStorageService.ts`.

Every key-accepting method uses `path.join(root, key)` with no check that the resolved path
stays within the configured root. Keys are currently constructed internally, so there is no
immediate vulnerability. Once upload handlers are implemented in Tasks 8+, any handler that
passes a filename-derived string as a storage key without normalisation creates a path traversal
risk. The storage layer should verify that `path.resolve(root, key)` starts with `root +
path.sep` before performing any file system operation. Raise this in Tasks 8, 9, 10, 14.

**S-002 — `server.ts`: graceful shutdown has no connection-drain timeout**

File: `apps/backend/src/server.ts`, lines 88–95.

`server.close()` waits indefinitely for existing connections to finish. A `setTimeout` calling
`server.closeAllConnections()` (Node.js 18.2+) after a configurable deadline would make
shutdown predictable under container orchestrators. Not blocking for Phase 1.

**S-003 — `config/index.ts`: `nconf` typed as `any` suppresses call-site verification**

File: `apps/backend/src/config/index.ts`, lines 27–28.

The `biome-ignore` comment correctly explains why the `any` cast is necessary. A narrower inline
interface exposing only the chaining methods actually used (`argv`, `env`, `file`, `get`) would
restore partial type safety. Not urgent.

## Summary

**Outcome**: Fail

One blocking finding: `server.ts` was not updated to use the shared `logger` from
`./middleware/logger.js` when the same fix was applied to `index.ts`. Two separate pino instances
exist at runtime.

All three `json5`/nconf focus-area concerns are resolved correctly. No other issues found in
`apps/backend/src/`.

The blocking finding should be addressed before Task 2 begins.
