# Code Review — Backend Service — Task 4: Implement middleware

**Date**: 2026-03-09 17:22
**Task status at review**: code_complete (confirmed by caller; task file shows `not_started` because the
developer has not yet updated it — this is consistent with the project's hard rule against
automatic status changes)
**Round**: 3 (follows round 1 fail and round 2 pass with two suggestions)
**Files reviewed**:

- `apps/backend/src/middleware/auth.ts`
- `apps/backend/src/middleware/validate.ts`
- `apps/backend/src/middleware/logger.ts`
- `apps/backend/src/middleware/errorHandler.ts`
- `apps/backend/src/middleware/__tests__/middleware.test.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/config/__tests__/config.test.ts`
- `apps/backend/package.json`

## Changes since round 2 (suggestions S-001 and S-002)

**S-001 (warn logging on 401)** — actioned. `createAuthMiddleware` now accepts `log: Logger`
as a second parameter and calls `log.warn` with `reqId`, `method`, and `url` on every 401.
No key value appears in the log output. `index.ts` passes `deps.log` to the call.

**S-002 (eslint-disable comments)** — actioned. Both `eslint-disable-next-line` lines in
`validate.ts` now have explanatory comments above them describing why the cast is unavoidable.

## Acceptance condition

The acceptance condition for Task 4 is **automated** (Vitest unit tests). The three sub-conditions are:

**(a) Auth middleware**: returns 401 when `x-internal-key` is absent; returns 401 when the
header value does not match either configured key; passes when the header matches
`auth.frontendKey`; passes when the header matches `auth.pythonKey`; skips auth for
`GET /api/health`.

**(b) Validation middleware**: returns 400 with Zod error details when a required body field is
missing; passes and attaches parsed values when the body is valid.

**(c) Error handler**: returns 500 with no stack trace for unknown errors; returns 404 for
`NotFoundError`; returns 409 for `ConflictError`. All tests pass.

**Result**: Met.

- **(a)** Four unit tests in `describe('createAuthMiddleware')` cover absent header (401),
  wrong key (401), `frontendKey` match (next called), and `pythonKey` match (next called). The
  health bypass is covered by two integration tests in `describe('GET /api/health auth
  bypass')`: `GET /api/health` with no key returns 200; another route with no key returns 401.
  The bypass is implemented by registering the health route before `app.use(createAuthMiddleware(...))`
  in `index.ts`, and the comment at that registration point explains the structural reason. All
  five behaviours from condition (a) are confirmed.
- **(b)** Two tests in `describe('validate')`: missing field returns 400 with `validation_error`
  and `details` array containing the failing path; valid body calls `next()` and `req.body` is
  updated with parsed values.
- **(c)** Three tests in `describe('createErrorHandler')`: unknown error returns 500 with
  `internal_error` and no `stack` key in the serialised body; `NotFoundError` returns 404 with
  `not_found`; `ConflictError` returns 409 with `conflict`.

The caller confirmed that all 21 tests pass, Biome lint passes, and TypeScript typecheck passes.

Manual verification instructions for the developer:

```sh
pnpm --filter backend test
pnpm --filter backend exec tsc --noEmit
```

Expected: all tests pass; no TypeScript errors.

## Findings

### Blocking

None.

### Suggestions

None.

## Summary

**Outcome**: Pass

No blocking findings. Both suggestions from round 2 have been correctly actioned:

- The warn log in `auth.ts` is correctly scoped to `reqId`, `method`, and `url` — no key
  value in output, consistent with ADR-044 and the no-secrets-in-logs principle.
- The `eslint-disable-next-line` lines in `validate.ts` now carry comments that explain the
  casts to reviewers reading the file in future.

The task is ready to advance to `reviewed`.
