# Code Review Principles

Numbered principles for the Code Reviewer agent. Each principle has a CR-number so it can be
referenced in review files and discussion. The Code Reviewer reads this document at the start
of every session (see First action, step 6 in code-reviewer.md).

---

## CR-001 — Structural acceptance via middleware validation

**Principle**: When an acceptance condition requires that the API rejects a request with a
specific HTTP status code (e.g. 400 for invalid input), and the validation is handled entirely
by the `validate({ body/params/query: Schema })` middleware using a Zod schema, the acceptance
condition is considered **structurally met** even without a separate service-layer or
route-layer unit test.

**Why**: The `validate` middleware enforces schema contracts at the request boundary before
the handler is called. If the Zod schema covers the stated condition (e.g. a regex pattern
for date format, a required field constraint), the condition cannot be violated at runtime.
Writing a test that mocks the route to bypass validation and test the service directly would
test a path that does not exist in production.

**How to apply**:

- Read the Zod schema for the input type. Confirm the condition is covered by the schema.
- If covered: mark the acceptance condition as met (structural). State in the review which
  schema rule covers it and cite CR-001.
- If the schema does not cover the condition: this is a **blocking** finding — either the
  schema must be updated or a service-level test must be added.
- Task 8 (document upload) established this precedent. All tasks 9–19 follow the same pattern.

---

## CR-002 — Structural acceptance must be explicitly documented

**Principle**: When CR-001 applies, the review file must explicitly state:

1. That the acceptance condition is structurally met (not vacuous).
2. Which Zod schema field or rule covers the condition.
3. The citation `CR-001` so the reasoning is traceable.

**Why**: Without explicit documentation, a structural pass looks identical to a missed test
to anyone reading the review later. This can cause unnecessary re-reviews or confusion during
audits.

**How to apply**: In the "Acceptance condition" section of the review, include a line such as:

> Structurally met via `UpdateDocumentMetadataRequest.date` (regex `^\\d{4}-\\d{2}-\\d{2}$`
> in `packages/shared/src/schemas/documents.ts`). The `validate({ body })` middleware enforces
> this before the service is called — no separate service test is required. CR-001.

---

## CR-003 — Error handler is not for domain errors

**Principle**: The global `createErrorHandler` middleware in `apps/backend/src/middleware/errorHandler.ts`
handles **unexpected errors only** (unhandled exceptions that reach Express's error pipeline).
It always returns 500. It is not the correct mechanism for domain errors such as not-found,
conflict, or validation failures.

Domain errors are handled in the route layer by mapping `ServiceResult` error types to HTTP
status codes via an exhaustive `ERROR_STATUS` record. This is the correct pattern.

**Why**: The project removed `AppError`, `NotFoundError`, `ConflictError`, and
`ValidationError` subclasses intentionally (post-Task-8 cleanup). Using `next(err)` for
domain errors, or throwing typed error subclasses, violates the established service/route
pattern and would route domain errors through the 500 handler.

**How to apply**:

- If a route handler calls `next(err)` for a known domain error (e.g. not-found, duplicate),
  this is a **blocking** finding.
- If a route handler throws a custom error class to produce a 404 or 409, this is a
  **blocking** finding.
- Legitimate uses of `next(err)`: unexpected exceptions caught by the `try/catch` wrapper
  around route handlers, where the error is not a known `ServiceResult` errorType.

---

## CR-004 — Repository methods are single-table

**Principle**: Repository methods in `apps/backend/src/db/repositories/` operate on a
single table. Cross-table queries (JOINs, subqueries referencing a different table) must
be moved to the service layer as separate repository calls.

**Why**: The single-table rule keeps repositories testable in isolation and prevents schema
coupling between repositories. The service layer orchestrates multiple repository calls
when cross-table data is needed (see `getDocumentQueue` calling both `documents.getFlagged`
and `pipelineSteps.getLatestFailedStepName` per row).

**How to apply**:

- If a repository method contains a JOIN or references a table other than its own, this is
  a **blocking** finding.
- N+1 queries at the service layer are acceptable where the alternative would require a JOIN
  across repositories. Flag as a **Suggestion** if the volume is expected to be large and
  a batched approach would be appropriate.

---

## CR-005 — Validate middleware is the input boundary

**Principle**: `validate({ body, params, query })` middleware is the sole mechanism for
validating Express request inputs. Raw `req.body`, `req.params`, or `req.query` must not
be accessed in route handlers without first being validated by `validate`. The validated
values are cast (not asserted) via `as TypeName` after the middleware confirms their shape.

**Why**: Bypassing the middleware allows unvalidated data to reach the service layer. The
cast after validation is safe because the middleware guarantees the shape. Adding a second
validation layer in the service for inputs that must be validated at the boundary is
redundant and misleading.

**How to apply**:

- If a route handler reads `req.body` without a preceding `validate({ body: Schema })` call
  in the same route's middleware chain, this is a **blocking** finding.
- If the service layer re-validates fields already guaranteed by the middleware schema
  (e.g. checking UUID format on `id` that was already validated by `DocumentIdParams`),
  flag as a **Suggestion** to remove the redundant check.
