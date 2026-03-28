# Code Review — Frontend Service — Task 18: Frontend configuration file and Docker setup

**Date**: 2026-03-28 21:37
**Task status at review**: in_review
**Round**: 2 (re-review)
**Files reviewed**:

- `apps/frontend/config.json5`
- `apps/frontend/config.docker.json5`
- `apps/frontend/Dockerfile`
- `docker-compose.yml` (root)
- `apps/frontend/server/config/index.ts`
- `apps/frontend/server/__tests__/server.test.ts` (Task 2 Tier 2 test)

---

## Context from round 1

Round 1 returned two blocking findings:

- **B-001**: `config.json5` sets `express.baseUrl: "http://localhost:4000"` instead of the
  task-specified `"http://backend:4000"`.
- **B-002**: `config.docker.json5` set `express.baseUrl: "http://host.docker.internal:4000"`,
  which cannot reach the `backend` container when both services run inside Docker Compose.

The developer fixed B-002 — `config.docker.json5` now correctly sets
`express.baseUrl: "http://backend:4000"`. Confirmed on line 14 of `config.docker.json5`.

The developer pushed back on B-001 with the following rationale: `config.json5` is the
base config for local development without Docker. A developer running the backend directly on
their machine connects via `localhost:4000`. `config.docker.json5` is volume-mounted as
`config.override.json5` inside the container and overrides `express.baseUrl` to
`http://backend:4000` for Docker Compose use. The nconf override hierarchy exists precisely
for this purpose.

---

## Acceptance condition

**Restated**: `config.json5` exists with all required keys; `Dockerfile` builds without
error (`docker build`); `docker-compose.yml` includes the `frontend` service; the
`express.internalKey` does not appear in any response header (verified by Tier 2 test from
Task 2).

**Condition type**: both

**Result**: Not met

### Automated aspect

The Task 2 Tier 2 security test (`apps/frontend/server/__tests__/server.test.ts`, line 13)
confirms that `testConfig.express.internalKey` does not appear in any response header. The
test is falsifiable: if the internal key were injected into a response header,
`expect(headerValues).not.toContain(testConfig.express.internalKey)` would fail. This aspect
is met.

### Manual aspect

The developer must verify the following before the task can pass:

1. From the repository root, run:
   `pnpm --filter frontend build`
   Expected: exits with code 0 (Next.js build succeeds).

2. Then run:
   `docker build -f apps/frontend/Dockerfile -t ik-frontend-test .`
   Expected: exits with code 0.

3. Confirm the Docker Compose stack starts and the frontend can reach the backend:
   `docker compose up frontend backend postgres`
   Then in a separate terminal:
   `curl -s http://localhost:3000/api/documents/queue`
   Expected: the request reaches the backend (any response code other than a connection
   error confirms the routing is working).

With B-002 now fixed, the Docker Compose stack will correctly resolve `http://backend:4000`
inside the container. The manual aspect can now be verified.

**The acceptance condition is not yet met because B-001 remains**: the task specification
explicitly requires `express.baseUrl: "http://backend:4000"` in `config.json5`. See below.

---

## Findings

### Blocking

**Finding 1 — `config.json5`: `express.baseUrl` value diverges from the task specification**

File: `apps/frontend/config.json5`, line 4

The task specification is explicit: `express.baseUrl: "http://backend:4000"` (with the
parenthetical note "(Docker Compose service name)"). The implementation has
`"http://localhost:4000"`.

**Assessment of the developer's rebuttal**:

The rebuttal is architecturally coherent. The nconf hierarchy in `server/config/index.ts`
confirms that `config.override.json5` (priority 3) overrides `config.json5` (priority 4), so
`config.docker.json5` mounted as `config.override.json5` will correctly supply
`http://backend:4000` inside the Docker container. The Docker Compose topology works.

However, the rebuttal does not change the fact that the implementation diverges from the
task specification. The task spec states the value and its rationale. The developer's
argument is essentially that the task spec was written before the `config.docker.json5`
override pattern was established, and that the override renders the base value correct for
its intended context.

That may be a valid argument — but the correct response is to update the task specification
to reflect the intended behaviour, not to implement against the spec and ask the reviewer to
accept the divergence. A code review cannot retroactively rewrite what the task requires.
The task spec must be updated to align with the implementation, or the implementation must
align with the task spec.

Additionally, the divergence from the backend's established pattern deserves noting: the
backend's `config.json5` uses Docker Compose service names as defaults (`"host": "postgres"`,
`python.baseUrl: "http://processing:8000"`). The frontend inverts this, using `localhost` as
the base and relying on the override to supply the Docker Compose name. Both patterns are
defensible; choosing a different pattern is a deliberate deviation that should be recorded.

**What must change**: either (a) update `config.json5` to `express.baseUrl: "http://backend:4000"`
as the task specifies, and supply a `config.override.json5` note in the task description for
local non-Docker development; or (b) update the task specification to reflect the `localhost`
base-config pattern and confirm it with the Head of Development. The developer must choose
one path and execute it before the task can advance.

### Suggestions

**Suggestion 1 — `config.json5`: `express.internalKey` value**

File: `apps/frontend/config.json5`, line 5

The implementation uses `"dev-frontend-key"`, which matches `apps/backend/config.json5`
`auth.frontendKey: "dev-frontend-key"` — so shared-key authentication works correctly in
local dev. This is carried forward from round 1 as a suggestion only.

Consider aligning with the task spec value `"change-me-in-production"` or adding a comment
noting that this key must be overridden before production use.

---

## Summary

**Outcome**: Fail

B-002 is resolved — `config.docker.json5` now correctly uses `http://backend:4000` for
Docker Compose service discovery.

B-001 remains. The implementation diverges from the task specification on `express.baseUrl`
in `config.json5`. The developer's architectural reasoning is sound, but the resolution
requires either updating the implementation to match the spec, or updating the spec to match
the implementation. Neither has been done. The task cannot advance to `review_passed` until
the spec and implementation are aligned.

Task status set to `review_failed`.

The review is ready for the user to check.
