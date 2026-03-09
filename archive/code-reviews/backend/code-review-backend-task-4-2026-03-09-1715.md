# Code Review — Backend Service — Task 4: Implement middleware (logger, auth, request validation, error handler)

**Date**: 2026-03-09 17:13
**Task status at review**: code_complete
**Review round**: 2 (re-review following Fail on round 1, B-001 resolved)

**Files reviewed**:

- `apps/backend/src/middleware/validate.ts` (new)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (new)
- `apps/backend/src/middleware/logger.ts` (modified — refactored to factories)
- `apps/backend/src/middleware/auth.ts` (existing, re-read for completeness)
- `apps/backend/src/middleware/errorHandler.ts` (existing, re-read for completeness)
- `apps/backend/src/index.ts` (modified — `AppDependencies` now includes `log: Logger`)
- `apps/backend/src/server.ts` (modified — `createLogger` called first in `start()`)
- `apps/backend/src/config/__tests__/config.test.ts` (modified — Biome formatting only)

---

## Acceptance condition

**Restated (condition type: automated)**:

> (a) The auth middleware returns 401 when `x-internal-key` is absent; returns 401 when the
> header value does not match either configured key; passes when the header matches
> `auth.frontendKey`; passes when the header matches `auth.pythonKey`; skips auth for
> `GET /api/health`.
>
> (b) The validation middleware returns 400 with Zod error details when a required body field
> is missing; passes and attaches parsed values when the body is valid.
>
> (c) The error handler returns 500 with no stack trace for unknown errors; returns 404 for
> `NotFoundError`; returns 409 for `ConflictError`. All tests pass.

**Result**: Met

**Detail**:

Condition (a):

- 401 when header absent: `middleware.test.ts` line 68 — checks `res.statusCode === 401` and `error === 'unauthorized'`. Correct.
- 401 when key does not match: `middleware.test.ts` line 80 — passes `'wrong-key'`, same assertions. Correct.
- Passes when `frontendKey` matches: `middleware.test.ts` line 92 — `nextFn` called once, status 200. Correct.
- Passes when `pythonKey` matches: `middleware.test.ts` line 104 — `nextFn` called once, status 200. Correct.
- Auth bypass for `GET /api/health`: `middleware.test.ts` lines 163–175 — supertest integration test against assembled `createApp()`. `GET /api/health` with no key returns 200; `GET /api/anything` with no key returns 401. The bypass is structural (health route registered before auth middleware in `index.ts`); the test confirms the end-to-end arrangement is correct. This resolves the B-001 finding from round 1.

Condition (b):

- 400 with Zod error details on missing field: `middleware.test.ts` line 187 — body missing `age`; checks status 400, `error === 'validation_error'`, `details` is an array, `age` appears in at least one issue's `path`. Correct.
- Passes and attaches parsed values on valid body: `middleware.test.ts` line 207 — `nextFn` called once, `req.body` equals the parsed object. Correct.

Condition (c):

- 500 with no stack trace for unknown error: `middleware.test.ts` line 227 — checks status 500, `error === 'internal_error'`, generic message, and `JSON.stringify(body)` does not contain `'stack'`. Correct.
- 404 for `NotFoundError`: `middleware.test.ts` line 242 — status 404, `error === 'not_found'`. Correct.
- 409 for `ConflictError`: `middleware.test.ts` line 254 — status 409, `error === 'conflict'`. Correct.

All five auth sub-conditions, both validation sub-conditions, and all three error handler sub-conditions are covered by tests that test actual behaviour.

---

## Findings

### Blocking

None.

### Suggestions

**S-001** — Auth failure not logged (`apps/backend/src/middleware/auth.ts`)

The Task 4 description states: "Log the auth failure with Pino (no key value in log output)." The current `auth.ts` does not log auth failures. The acceptance condition does not mention logging, so this does not block the task. However it is a deviation from the plan description. The developer should either add logging to `createAuthMiddleware` (which would require accepting a `Logger` parameter, consistent with the factory pattern already used in `createErrorHandler` and `createRequestLogger`) or update the plan description to reflect the deliberate omission. Neither is required before advancing to `reviewed`.

**S-002** — Disable comment does not explain why the cast is unavoidable (`apps/backend/src/middleware/validate.ts`, lines 46 and 55)

The `// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment` comments suppress the lint rule but do not explain why the cast is unavoidable. The project standard (development-principles.md §7, TypeScript strict mode) asks for an inline comment explaining unavoidable unsafe assignments. A brief comment such as `// Zod's inferred return type does not match Express's exact Record<string, string> — cast is safe here` would satisfy the standard. Not blocking.

---

## Summary

**Outcome**: Pass

No blocking findings. The B-001 finding from round 1 (missing test for `GET /api/health` auth bypass) is resolved: a supertest integration test now exercises the assembled `createApp()` end-to-end and confirms the structural bypass works correctly. The logger refactor (`createLogger` / `createRequestLogger` factories, injected `log: Logger` via `AppDependencies`) is a clean architectural improvement and aligns `logger.ts` with the factory pattern already established in `createErrorHandler`.

The task is ready to advance to `reviewed`.
