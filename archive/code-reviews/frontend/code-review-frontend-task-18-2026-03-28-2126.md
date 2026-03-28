# Code Review — Frontend Service — Task 18: Frontend configuration file and Docker setup

**Date**: 2026-03-28 21:26
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/config.json5` (committed; last changed in Task 10)
- `apps/frontend/config.docker.json5` (untracked, new file)
- `apps/frontend/Dockerfile` (unstaged changes)
- `docker-compose.yml` (root, unstaged changes)
- `apps/frontend/docker-compose.yml` (unstaged changes)
- `apps/frontend/server/server.ts` (unstaged changes)
- `apps/frontend/package.json` (unstaged changes)
- `apps/frontend/server/__tests__/server.test.ts` (existing, from Task 2)

**Note on commit state**: The Task 18 implementation files are present in the working
directory but are not staged or committed to the `feature/frontend-task-18` branch. The
review is conducted against the on-disk state as the implemented work.

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
confirms that `testConfig.express.internalKey` (`'test-internal-key'`) does not appear in
any response header. The test is falsifiable: if the internal key were injected into a
response header, `expect(headerValues).not.toContain(testConfig.express.internalKey)` would
fail. This aspect of the acceptance condition is met.

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

**The manual aspect cannot pass in its current state** because `config.docker.json5` sets
`express.baseUrl` to `http://host.docker.internal:4000`. When both `frontend` and `backend`
run inside the same Docker Compose network, `host.docker.internal` resolves to the Docker
host machine — not to the `backend` container. The frontend container cannot reach the
backend container at this address. The correct URL for a fully containerised Compose stack
is `http://backend:4000` (the Compose service name). See Blocking Finding 2.

---

## Findings

### Blocking

**Finding 1 — `config.json5`: `express.baseUrl` value diverges from the task specification**

File: `apps/frontend/config.json5`, line 4

The task specification requires `express.baseUrl: "http://backend:4000"` and notes "(Docker
Compose service name)". The implementation has `"http://localhost:4000"`.

The backend service follows the pattern of using Docker Compose service names as defaults
in `config.json5` (for example, `apps/backend/config.json5` uses `"host": "postgres"` for
the database). The frontend diverges from this pattern by using `localhost` as the base URL.

The divergence also means the base `config.json5` value is never correct for a containerised
deployment without an override — every Docker Compose use requires the developer to provide
`config.docker.json5` (or equivalent). By contrast, the backend `config.json5` works
out-of-the-box in both Docker Compose and (with override) for local-only development.

The `express.baseUrl` must be changed to `"http://backend:4000"` in `config.json5`. The
local-dev override (`http://localhost:4000`) should be supplied via `config.override.json5`
by developers running the backend outside Docker.

**Finding 2 — `config.docker.json5`: `express.baseUrl` uses `host.docker.internal` instead of Docker Compose service name**

File: `apps/frontend/config.docker.json5`, line 14

The file sets `express.baseUrl` to `"http://host.docker.internal:4000"`. This volume-mounted
override is applied inside the Docker Compose `frontend` container.

`host.docker.internal` resolves to the IP address of the Docker host machine. When the
`backend` service also runs as a Docker Compose service (as in the root `docker-compose.yml`),
the backend container is not reachable at `host.docker.internal:4000`. The correct address
within the Compose network is `http://backend:4000` (the service name defined in
`docker-compose.yml`).

The current value works only in a split scenario where the frontend runs in Docker but the
backend runs directly on the host. This is not the deployment topology described in
`docker-compose.yml` or the task.

`config.docker.json5` must change `express.baseUrl` to `"http://backend:4000"`.

Additionally, given that Finding 1 is resolved by changing `config.json5` to use
`http://backend:4000`, `config.docker.json5` may not need to override `express.baseUrl` at
all if the base value is already correct for Docker Compose. The Docker override file is then
only needed for values that genuinely differ between Docker and non-Docker environments
(for example, `express.internalKey` in production). The developer should decide whether to
keep the override file or consolidate.

### Suggestions

**Suggestion 1 — `config.json5`: `express.internalKey` value differs from task specification**

File: `apps/frontend/config.json5`, line 5

The task specification says `express.internalKey: "change-me-in-production"`. The
implementation uses `"dev-frontend-key"`.

The current value `"dev-frontend-key"` is consistent with the backend's
`auth.frontendKey: "dev-frontend-key"` in `apps/backend/config.json5`, so the shared-key
authentication will function correctly in a local dev environment. The choice of a specific
key value is not security-critical for a local dev default.

However, the task specification chose `"change-me-in-production"` as an explicit signal to
operators that this key must be rotated before production use. `"dev-frontend-key"` does not
carry this signal. Consider aligning with the task specification value, or add a comment to
`config.json5` noting that `express.internalKey` must be overridden in production.

---

## Summary

**Outcome**: Fail

Two blocking findings prevent the task from advancing:

1. `config.json5` uses `express.baseUrl: "http://localhost:4000"` instead of the
   task-required `"http://backend:4000"` (Docker Compose service name), diverging from the
   backend's established pattern of using service names as defaults.

2. `config.docker.json5` sets `express.baseUrl: "http://host.docker.internal:4000"`, which
   cannot reach the `backend` container when both services run inside Docker Compose. The
   full Compose stack will fail to connect.

The `Dockerfile` is structurally sound (multi-stage build with `devdeps` stage, Hono custom
server entry point via `tsx`, correct production artifact selection). The Task 2 Tier 2 test
confirms the `express.internalKey` is not exposed in response headers. Both findings are
confined to the config and Docker Compose override files.

Task status set to `review_failed`.

The review is ready for the user to check.
