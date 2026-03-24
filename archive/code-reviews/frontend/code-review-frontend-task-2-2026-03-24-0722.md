# Code Review — Frontend Service — Task 2: Hono custom server setup

**Date**: 2026-03-24 07:22
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/server.ts`
- `apps/frontend/server/config/index.ts`
- `apps/frontend/server/requests/client.ts`
- `apps/frontend/server/requests/documents.ts`
- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/routes/index.ts`
- `apps/frontend/server/routes/documents.ts`
- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/server/__tests__/server.test.ts`
- `apps/frontend/config.json5`
- `apps/frontend/biome.json`
- `apps/frontend/vitest.config.ts`
- `apps/frontend/package.json`
- `.gitignore` (root)

---

## Acceptance condition

**Condition type**: both

**Stated condition**: `server/server.ts` and `server/config/index.ts` exist and are correctly
structured; the pre-configured Ky instance exists in `server/requests/client.ts` with base URL
and `x-internal-key` set; Tier 2 supertest tests pass including the internal key non-leak
assertion; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Result**: Met

**Automated** (`pnpm --filter frontend test --run`): All three tests pass.

- Smoke test (`POST /api/documents/upload` returns 501) — confirms the server starts and
  the route stub is registered correctly.
- Security assertion (`x-internal-key` value does not appear in any response header) —
  reads `config.express.internalKey` from the loaded config and asserts it is absent from
  all response header values. This directly tests the stated condition.
- Auth no-op (requests without an auth header receive neither 401 nor 403) — confirms the
  Phase 1 middleware is truly a no-op.

**Manual** checks:

Run the following commands from the monorepo root:

```bash
pnpm biome check apps/frontend
pnpm --filter frontend exec tsc --noEmit
```

Both were run during this review session and produced no errors or warnings.

`server/server.ts` is correctly structured: `next()` with `customServer: true`,
`nextApp.prepare()` awaited before mounting routes, auth middleware registered on `/api/*`,
API routes mounted, Next.js catch-all present. `server/config/index.ts` loads nconf with the
four-level hierarchy and validates via Zod at startup (fail-fast). `server/requests/client.ts`
creates a Ky instance with `prefixUrl` set to `express.baseUrl` and `x-internal-key` set to
`express.internalKey`.

---

## Findings

### Blocking

None.

---

### Suggestions

**S-1** — `apps/frontend/server/server.ts`, line 49: `handler` is not awaited

The Next.js catch-all calls `handler(incoming, outgoing, parse(c.req.url, true))` without
`await`. `nextHandler` is an async function — if it rejects (e.g. on an unhandled route error),
the rejection is silently discarded and `return new Response()` executes immediately. Errors
reaching the user will appear as an empty 200 rather than a meaningful error response. The fix
is `await handler(...)`. This is not blocking because the catch-all is only exercised at
runtime (not in the Tier 2 test suite) and the task scope is infrastructure scaffolding, but
it should be addressed before any page traffic is routed through this path.

---

**S-2** — `apps/frontend/server/server.ts`, line 67: `console.log` instead of Pino

`development-principles.md` §10 states "Structured logging (Pino) from the first line" as a
Phase 1 requirement. `pino` is already listed as a dependency in `package.json`. The startup
log message uses `console.log` instead of a Pino logger instance. This diverges from the
production-ready logging principle and from the backend startup pattern. Suggested fix: create
a Pino instance in `server.ts` and use it for the startup message and any future server-level
log output.

---

**S-3** — `apps/frontend/server/routes/documents.ts` and `curation.ts`: full `ServerDeps`
bag passed to route factories

`development-principles.md` (Dependency Composition Pattern, narrowing rule) states that route
factories should receive only the dependency they actually use — not the full deps bag. Both
`createDocumentsRouter(deps: DocumentsDeps)` and `createCurationRouter(deps: CurationDeps)`
receive a struct that is identical to `ServerDeps` (`{ config, expressClient }`). The
narrowing rule would have each factory accept only the request repository it uses
(e.g. `createDocumentsRouter(requests: DocumentsRequests)`). This is a suggestion rather than
blocking for two reasons: (a) the docs note that route factories that are coordination
functions may receive a wider bag, and (b) this design was agreed during the implementation
session as intentional. When actual handler logic is added in later tasks, the narrowing should
be revisited to ensure each route file only imports what it needs.

---

**S-4** — `apps/frontend/server/__tests__/server.test.ts`, line 5: test imports real config

The test imports `config` from `'../config'`, which loads and validates `config.json5` at
import time. This means the test requires `config.json5` to be present and valid. If the file
is absent (e.g. in a CI environment that only provides `config.override.json5`), the test
suite will fail at import with a startup validation error rather than a test failure. This is
low risk for now (config.json5 is committed), but a dedicated `parseConfig` call with a
minimal test fixture would make the test independent of the deployed config file. The
`parseConfig` function is already exported for exactly this purpose.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation meets all stated acceptance conditions. The three
quality checks pass cleanly. The architectural patterns (config module, Ky client factory,
`createHonoApp` testability hook, route factory composition, `ExpressClient` namespace
structure, `proceed` rename to avoid `next` shadowing) are sound and consistent with the
backend's established patterns. The request stub methods (`throw new Error('not_implemented')`)
correctly mirror the 501 route stubs and establish clear TODOs for later tasks.

Four suggestions are recorded above. None are required before this task advances.

Task status set to `review_passed`.

The review is ready for the user to check.
