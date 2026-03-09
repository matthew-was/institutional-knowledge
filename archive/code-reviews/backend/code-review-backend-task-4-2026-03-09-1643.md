# Code Review — Backend Service — Task 4: Implement middleware (logger, auth, request validation, error handler)

**Date**: 2026-03-09 16:43
**Task status at review**: code_complete (note: the task file still shows `not_started` — the developer should update it to `code_complete` before or alongside this review)
**Files reviewed**:

- `apps/backend/src/middleware/validate.ts` (new)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (new)
- `apps/backend/src/config/__tests__/config.test.ts` (modified — Biome formatting fixes only)
- `apps/backend/src/middleware/auth.ts` (Task 1 scaffolding, reviewed for acceptance condition coverage)
- `apps/backend/src/middleware/errorHandler.ts` (Task 1 scaffolding, reviewed for acceptance condition coverage)
- `apps/backend/src/middleware/logger.ts` (Task 1 scaffolding, reviewed for plan compliance)
- `apps/backend/src/index.ts` (Task 1 scaffolding, reviewed for health-route bypass placement)

---

## Acceptance condition

The task has three automated sub-conditions:

**(a)** The auth middleware returns 401 when `x-internal-key` is absent; returns 401 when the header value does not match either configured key; passes when the header matches `auth.frontendKey`; passes when the header matches `auth.pythonKey`; skips auth for `GET /api/health`.

**(b)** The validation middleware returns 400 with Zod error details when a required body field is missing; passes and attaches parsed values when the body is valid.

**(c)** The error handler returns 500 with no stack trace for unknown errors; returns 404 for `NotFoundError`; returns 409 for `ConflictError`. All tests pass.

**Condition type**: automated

**Result**: Partially met — see blocking finding B-001.

### (a) Auth middleware

Four of the five conditions are tested and non-vacuous:

- `returns 401 when x-internal-key header is absent` — confirmed: `mockReq({ headers: {} })` → asserts `statusCode === 401` and `error === 'unauthorized'`. Non-vacuous.
- `returns 401 when the header value does not match either key` — confirmed: `{ 'x-internal-key': 'wrong-key' }` → asserts 401. Non-vacuous.
- `calls next() when x-internal-key matches frontendKey` — confirmed: `{ 'x-internal-key': 'frontend-secret' }` → asserts `nextFn` called once, `statusCode` still 200. Non-vacuous.
- `calls next() when x-internal-key matches pythonKey` — confirmed: `{ 'x-internal-key': 'python-secret' }` → asserts `nextFn` called once. Non-vacuous.

**Missing**: There is no test confirming that `GET /api/health` skips auth. The caller's note explains this is implemented structurally in `index.ts` (health route registered before auth middleware) rather than in `auth.ts` itself. The acceptance condition states the middleware "skips auth for `GET /api/health`" — the mechanism used is architectural placement, not a code path inside the middleware. A test of this behaviour requires either (a) a `supertest` integration test against the assembled `createApp()`, or (b) an explicit note in the task acceptance condition verification confirming that the structural placement in `index.ts` is the accepted implementation. Neither currently exists. **This is a blocking finding — see B-001.**

### (b) Validate middleware

Both conditions are tested and non-vacuous:

- `returns 400 with Zod error details when a required body field is missing` — confirmed: schema requires `age` (number), body contains only `name` → asserts `statusCode === 400`, `error === 'validation_error'`, `details` is an array, and the array contains an issue with `path` including `'age'`. Directly tests Zod issue propagation. Non-vacuous.
- `calls next() and attaches parsed values when body is valid` — confirmed: valid body `{ name: 'Alice', age: 30 }` → asserts `nextFn` called once, `req.body` equals the parsed object. Non-vacuous.

### (c) Error handler

All three conditions are tested and non-vacuous:

- `returns 500 with no stack trace for unknown errors` — confirmed: `new Error('boom')` → asserts `statusCode === 500`, `error === 'internal_error'`, `message === 'An unexpected error occurred'`, and `JSON.stringify(body)` does not contain `'stack'`. The stack-trace check is behavioural (not just a type check). Non-vacuous.
- `returns 404 for NotFoundError` — confirmed: `new NotFoundError()` → asserts `statusCode === 404`, `error === 'not_found'`. Non-vacuous.
- `returns 409 for ConflictError` — confirmed: `new ConflictError('already exists')` → asserts `statusCode === 409`, `error === 'conflict'`. Non-vacuous.

### Manual verification for developer

Once B-001 is resolved, the developer must confirm all tests pass by running:

```bash
pnpm --filter backend exec vitest run src/middleware/__tests__/middleware.test.ts
```

Expected output: all tests pass with no failures.

---

## Findings

### Blocking

**B-001 — Missing test for `GET /api/health` auth bypass**

File: `apps/backend/src/middleware/__tests__/middleware.test.ts`

The acceptance condition (a) explicitly requires a test that confirms auth is skipped for `GET /api/health`. No such test exists in the test file. The current test suite covers only `createAuthMiddleware` in isolation and cannot demonstrate the bypass behaviour, because the bypass is implemented structurally (the health route is registered before the auth middleware in `index.ts`) rather than as a code branch inside the middleware.

What must change: a test must be added that exercises the assembled Express application and confirms that `GET /api/health` returns 200 without an `x-internal-key` header. The appropriate tool is `supertest` used against `createApp()` with stub dependencies. The test must assert both that (1) `GET /api/health` with no key returns 200, and (2) another route (e.g. `GET /api/anything`) with no key returns 401 — this confirms the bypass is specific to the health endpoint and not a global misconfiguration.

If the developer prefers not to introduce `supertest` at this stage, an alternative is to annotate the acceptance condition verification explicitly: amend the task's acceptance condition section to state that "skips auth for `GET /api/health`" is verified by structural inspection of `index.ts` (health route registered before auth middleware) rather than by an automated test, and obtain the developer's sign-off that this is acceptable. In that case, the acceptance condition text in the task file should be updated to reflect this. Either way, the current state — where the condition is stated as "automated" but has no test for this specific bullet — is a gap that must be resolved before the task can advance.

---

### Suggestions

**S-001 — `validate.ts`: collect errors across all schemas before responding**

File: `apps/backend/src/middleware/validate.ts`, lines 30–57

The current implementation collects issues from all three schemas (body, params, query) into a single `errors` array before returning — this is correct behaviour and returns all validation problems in one response rather than short-circuiting on the first failure. This is good. No change needed here; noting it explicitly because it is a deliberate quality choice worth preserving.

**S-002 — `middleware.test.ts`: shared `next` variable is never reset between tests**

File: `apps/backend/src/middleware/__tests__/middleware.test.ts`, line 55

The `const next: NextFunction = vi.fn()` at module scope is shared across all tests. Because `vi.fn()` accumulates call counts across invocations, if any test in a future `describe` block calls `next` and a later test then checks whether `next` was called, it may see stale state. The tests that check `next()` calls currently use local `nextFn = vi.fn()` (which is correct — lines 92, 106, 129, 150, 169, 185, 199), so the shared `next` is used only as a placeholder in tests that do not assert on it. This is safe for now but could cause confusion as the test file grows. Consider removing the module-level `next` and using a local `vi.fn()` in every test that needs one. This is a style concern, not a correctness issue.

**S-003 — `errorHandler.ts`: `req.log` not used for unknown errors**

File: `apps/backend/src/middleware/errorHandler.ts`, line 70

The error handler logs unknown errors using the injected `log` parameter (`log.error(...)`) rather than `req.log` (the per-request child logger provided by pino-http). For `AppError` subclasses it also uses `log.warn(...)`. Using the injected logger is correct and safe; it just means unknown errors do not carry the per-request correlation ID in the same way that `req.log` would provide it. The `reqId` is explicitly added to the log object (`{ reqId: req.id, err }`) which achieves the same result. No change needed — this is already well-handled.

**S-004 — `validate.ts`: return type annotation on the exported function**

File: `apps/backend/src/middleware/validate.ts`, line 22

The `validate(schemas: ValidateSchemas)` function has typed parameters but no explicit return type annotation. The TypeScript compiler can infer `(req: Request, res: Response, next: NextFunction) => void` but an explicit return type on the outer function (`RequestHandler`) would make the intent clearer and catch any future divergence from the Express handler signature. This is a TypeScript strict-mode suggestion rather than a violation, since the return type is unambiguously inferable.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the acceptance condition requires a test confirming that `GET /api/health` skips auth, and no such test exists. The code implementing the bypass (structural placement in `index.ts`) is correct; the gap is in test coverage for this specific acceptance condition bullet.

All other aspects of the implementation are sound:

- `validate.ts` is clean, correctly typed (with inline comments on the two necessary casts), and handles all three schema slots correctly.
- `auth.ts` correctly implements the shared-key pattern per ADR-044 with a `Set`-based lookup and no key value in log output.
- `errorHandler.ts` correctly separates `AppError` subclasses from unknown errors, returns no stack trace for unknown errors, and uses semantically correct HTTP status codes.
- `logger.ts` correctly excludes request/response bodies from logs (preventing document content leakage), reads log level from config, and assigns UUID v4 request IDs.
- The `index.ts` middleware ordering (health route before auth middleware) correctly implements the bypass.
- No hardcoded keys, provider names, or secrets in any middleware file.
- No data access violations (no direct DB calls in middleware).
- The `config.test.ts` changes are formatting-only and do not affect test behaviour.

The task returns to `in_progress` until B-001 is resolved.
