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

**Scope**: CR-001 applies specifically when evaluating formal task acceptance conditions in
code review files. It is the mechanism by which a reviewer can mark an acceptance condition
as structurally met without a dedicated test. General testing decisions (which tier to use,
what to test at the unit vs integration level) are governed by the two-tier rule in
`development-principles.md` — not by CR-001.

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

## CR-004 — Repositories have single domain responsibility

**Principle**: Repository files in `apps/backend/src/db/repositories/` group database
access by **domain**. All SQL lives in repositories — services never write SQL directly.
Each repository owns the tables within its domain. Within-domain read queries (JOINs,
subqueries) and within-domain transactions are permitted freely. Cross-domain writes —
transactions that insert into or delete from a table owned by a different repository —
must not appear inside a repository method.

**Why**: Grouping by domain rather than by table reflects how queries are actually written.
Related tables are frequently joined to satisfy a single business query, and forcing those
joins into the service layer as N+1 calls pushes SQL orchestration upward where it does not
belong. The hard boundary is mutation: a repository must not write to another domain's
tables, because that couples two domains at the database layer in a way that is difficult
to reason about and impossible to swap out independently.

Read-only joins into a neighbouring domain's tables are permitted where the data required
is small and incidental to the primary query (e.g. joining `documents` to fetch a
description and date to enrich a vocabulary result). This is different from owning or
mutating that data.

**How to apply**:

- If a repository method **inserts, updates, or deletes** rows in a table owned by a
  different repository, this is a **blocking** finding.
- If a repository method **reads** from a table outside its primary domain via a JOIN or
  subquery, assess whether the data is incidental context for the primary query. If yes,
  this is permitted — not a finding. If the method's primary purpose is to retrieve data
  from the other domain, it belongs in that domain's repository — flag as a **blocking**
  finding.
- If a service method writes raw SQL or calls `db._knex` for anything other than a
  transaction boundary, this is a **blocking** finding.
- N+1 queries at the service layer are acceptable where a join would cross repository
  boundaries. Flag as a **Suggestion** if a batched single-repository call would be more
  appropriate.

---

## CR-006 — Exhaustive `ERROR_STATUS` Record

**Principle**: Route handlers must map service error types to HTTP status codes using an
exhaustive `Record<ServiceErrorType, number>` constant. TypeScript enforces at compile time
that every member of the error type union is mapped.

```typescript
const ERROR_STATUS: Record<VocabularyErrorType, number> = {
  not_found: 404,
  wrong_source: 409,
  duplicate_term: 409,
  target_not_found: 404,
};
```

Using a type assertion (`status as ErrorType`) or a nullish fallback (`?? 500`) to handle
the lookup is a **blocking** finding — it defeats exhaustiveness and allows new error types
to be added to the service without a corresponding HTTP mapping.

**Why**: The exhaustive record means the TypeScript compiler will error if a new `errorType`
is added to the service union without updating the route. This makes error handling
self-maintaining as the service evolves.

**How to apply**:

- Confirm the `ERROR_STATUS` constant is typed as `Record<XxxErrorType, number>` (not a
  plain object literal with inferred type).
- If the constant uses a cast (`as SomeErrorType`) or a `?? fallback` lookup: **blocking**
  finding — the exhaustiveness guarantee is lost.
- The `errorStatus()` wrapper pattern (a helper function that encapsulates the lookup with
  a fallback) is the prohibited form of this anti-pattern — flag as **blocking**.

---

## CR-007 — Two-tier testing rule is applied

**Principle**: For every handler task, confirm that route integration tests from HTTP to
real DB are present and that no service-level test files using mocked Knex exist for
that task.

**Why**: Service-level tests with mocked `db`/`storage` bypass the `validate` middleware
and the route layer entirely, leaving those paths untested. The two-tier testing rule in
`development-principles.md` is explicit: there is no middle tier.

**How to apply**:

- Confirm at least one `routes/__tests__/*.integration.test.ts` file covers the task's routes.
- If any `services/__tests__/` file exists for this task with mocked deps: **blocking** finding.
- If integration tests are absent entirely: **blocking** finding.

---

## CR-008 — Infrastructure abstractions are used at all call sites

**Principle**: For every infrastructure abstraction named in the backend plan
(`StorageService`, `VectorStore`, `GraphStore`), all call sites in the implementation
must use the injected dependency — not a lower-level equivalent.

**Why**: Calling `db.embeddings.insert()` directly instead of `vectorStore.write()`
bypasses the abstraction, breaks the Infrastructure as Configuration principle, and —
critically — bypasses `trx` threading, causing FK violations inside transactions.

**How to apply**:

- Identify every abstraction named in the task's plan section.
- Search for direct calls to the underlying repository from service or route code
  (e.g. `db.embeddings.insert`, `db.chunks.insert` where `vectorStore.write` is expected).
  If found: **blocking** finding.
- If the abstraction is missing a parameter needed by the implementation (e.g. `trx`),
  the correct fix is to extend the abstraction — not to bypass it. Bypassing to work
  around a missing parameter is a **blocking** finding.

---

## CR-009 — Shared schemas must not encode operational limits

**Principle**: When reviewing schemas in `packages/shared/src/schemas/`, check whether any
`.max()` or `.min()` numeric constraints encode operational limits (depth ceilings, size
limits, retry counts, timeouts) that are backend- or environment-specific.

**Why**: Shared Zod schemas define the API contract consumed by multiple services. Embedding
a PostgreSQL-specific traversal depth ceiling in a schema that Python also reads couples the
contract to an implementation detail of one backend. The constraint belongs in config, with
the service enforcing it via `ServiceResult` (ADR-001, ADR-049).

**How to apply**:

- For each `.max()` on a numeric field in a shared schema: ask whether the value is
  structural (e.g. a business rule like "a rating must be 1–5") or operational (e.g. "the
  database can't handle more than N hops"). Structural bounds belong in the schema;
  operational bounds belong in config.
- If an operational limit is hardcoded in a shared schema: **Suggestion** — note the
  relevant ADR (ADR-001) and recommend moving the ceiling to `config` with service
  enforcement.

---

## CR-010 — Null substitution in repository row-mapping code

**Principle**: When reviewing repository methods that map raw database rows to typed objects,
check for `?? ''` (null-to-empty-string) substitutions on nullable fields.

**Why**: An empty string and a null value are semantically different. `?? ''` silently
converts a meaningful absence of data into a value that callers cannot distinguish from a
real empty string. The project preference is explicit `null` for absent data (see
`development-principles.md` §7).

**How to apply**:

- Search for `?? ''` in repository row-mapping code (the `return result.rows.map(...)` or
  equivalent blocks). If found on a field that is nullable in the DB schema: **Suggestion**
  — replace with `null` and update the TypeScript type accordingly.
- This is a **Suggestion**, not a blocker, unless the field's nullability is load-bearing
  for a contract (e.g. a shared Zod schema that declares the field non-nullable).

---

## CR-011 — No dead repository methods

**Principle**: Repository methods that have no call sites anywhere in the codebase (services, routes, tests, startup) are dead code and must be removed before the task is marked complete.

**Why**: Dead methods in a repository create false affordances — future implementers may call them assuming they are tested and correct, when in fact they have never been exercised. They also inflate the repository's apparent surface area and make the domain model harder to understand.

**How to apply**:

- For each public method added to a repository in the task diff, confirm at least one call site exists outside the repository file itself.
- If a method has no call sites: **Suggestion** — remove it. Escalate to **Blocking** if the method is referenced in an acceptance condition or task description as required behaviour.

---

## CR-012 — Cleanup and sweep operations follow development-principles.md

**Principle**: When reviewing any cleanup, sweep, or recovery function, verify it follows
the patterns documented in `development-principles.md` rather than restating them here.

**How to apply**:

- Check that cleanup operations follow the resource ordering, isolation, and error-handling
  patterns in `development-principles.md` (Startup Sweep Design Principle section)
- Check that UUID generation follows the UUID Version Standard (backend) section
- For any other implementation pattern, consult `development-principles.md` as the
  canonical reference — do not restate rules from it in this file

---

## CR-013 — Next.js bundler: no explicit `.js` extensions on local imports

**Principle**: Relative imports within `apps/frontend/src/` must not include an explicit
`.js` extension. With `moduleResolution: bundler`, Next.js resolves TypeScript source files
directly and does not perform Node-style extension substitution. An explicit `.js` suffix
causes a "module not found" error at dev-server startup.

**Why**: Vitest uses its own resolver and tolerates `.js` extensions, so automated tests
pass while the dev server fails. This makes the error easy to miss without a manual check.
See `development-principles.md` (Frontend Framework Agnosticism — Next.js bundler section).

**How to apply**:

- Scan all new or modified files under `apps/frontend/src/` for relative imports ending in `.js`.
- If found: **blocking** finding — remove the extension.
- Imports in test files (`*.test.ts`, `*.test.tsx`) are exempt; Vitest handles them correctly.

---

## CR-014 — Next.js bundler: Node-only modules declared in `serverExternalPackages`

**Principle**: Any module that uses Node-only APIs or CJS `require` tricks (e.g. `nconf`
loaded via `createRequire`) and is imported — directly or transitively — by a Next.js page
or Server Component must be listed in `serverExternalPackages` in `next.config.ts`.

**Why**: Next.js bundles all Server Component imports by default. Modules that cannot be
bundled fail silently in tests (Vitest does not use the Next.js bundler) and only surface
as a build or dev-server error when the affected page is loaded. See
`development-principles.md` (Frontend Framework Agnosticism — Next.js bundler section).

**How to apply**:

- If a new import chain from a page or Server Component reaches a Node-only or CJS module
  (identifiable by `createRequire`, `require()`, or Node built-in imports like
  `node:module`): check that the module is listed in `serverExternalPackages`.
- If missing: **blocking** finding — add the module name to `serverExternalPackages` in
  `next.config.ts`.

---

## CR-015 — Test assertions must be falsifiable

**Principle**: For each new test assertion, verify that it would fail if the production
code it is meant to cover were deleted or stubbed to a no-op. An assertion that passes
regardless of the behaviour under test is vacuous — it provides no regression protection
and gives false confidence.

**Why**: Vacuous assertions are easy to write unintentionally when testing stateful code.
A value that starts as `null` and is never set will always satisfy `expect(x).toBeNull()`,
even if the function under test was supposed to set it to something meaningful. The test
appears to pass but covers nothing.

**How to apply**:

- For each assertion in a new test, ask: "Would this assertion fail if the specific
  function or branch it exercises were removed?" If no, it is vacuous — **blocking** finding.
- Common patterns to watch for:
  - Asserting a value is `null` when it was never set before the call under test
  - Asserting a value equals its default when the code path is supposed to change it
  - Asserting that no error was thrown when the test never reached the code that would throw
- The fix is typically to assert the output value that the code under test is responsible
  for producing — not a side-effect that happens to be true unconditionally.

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
