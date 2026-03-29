# Code Review — Frontend Service — Task 18: Frontend configuration file and Docker setup

**Date**: 2026-03-28 21:51
**Task status at review**: in_review
**Round**: 4 (re-review)
**Files reviewed**:

- `apps/frontend/config.json5`
- `apps/frontend/config.docker.json5`
- `apps/frontend/Dockerfile`
- `docker-compose.yml` (root)
- `apps/frontend/server/config/index.ts`
- `apps/frontend/server/__tests__/server.test.ts` (Task 2 Tier 2 test)

---

## Context from previous rounds

- **Round 1**: Two blocking findings — B-001 (`config.json5` `express.baseUrl` was
  `"http://backend:4000"`) and B-002 (`config.docker.json5` `express.baseUrl` was
  `"http://host.docker.internal:4000"`). Both addressed.
- **Round 2**: B-002 fixed. B-001 was re-raised pending spec/implementation alignment.
  Developer provided sound architectural rationale (nconf override pattern).
- **Round 3**: Spec updated to reflect `config.json5` as local-dev default
  (`"http://localhost:4000"`). A new blocking finding was raised: `config.docker.json5`
  was missing `express.internalKey`, which the spec at that point required explicitly.
- **Round 4**: Caller confirms the task spec has been updated to reflect that
  `express.internalKey` is intentionally omitted from `config.docker.json5`. The spec
  now records the rationale: it inherits `"dev-frontend-key"` from `config.json5`, which
  already matches `auth.frontendKey` in the backend base config; including it in the Docker
  override would require a matching backend override to stay in sync, so it is deliberately
  absent from both overrides. Spec and implementation are now aligned.

---

## Acceptance condition

**Restated**: `config.json5` exists with all required keys; `Dockerfile` builds without
error (`docker build`); `docker-compose.yml` includes the `frontend` service; the
`express.internalKey` does not appear in any response header (verified by Tier 2 test from
Task 2).

**Condition type**: both

**Result**: Partially met — automated aspect met; manual aspect requires developer action.

### Automated aspect — `config.json5` exists with all required keys

`apps/frontend/config.json5` contains all keys listed in the task spec:

- `server.port: 3000` — present
- `express.baseUrl: "http://localhost:4000"` — present (local-dev default, as required)
- `express.internalKey: "dev-frontend-key"` — present; matches `auth.frontendKey` in
  `apps/backend/config.json5`, so shared-key auth works correctly in local dev
- `upload.maxFileSizeMb: 50` — present
- `upload.acceptedExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"]` — present

`server.host` is also present; it is not listed in the task spec but is required by the
`ConfigSchema` `server` sub-object (line 48 of `server/config/index.ts`). This is correct
and expected.

This aspect is met.

### Automated aspect — `express.internalKey` not in response headers

`apps/frontend/server/__tests__/server.test.ts` line 13–17: the security test reads
`testConfig.express.internalKey` and asserts its value is absent from all serialised
response header values. The assertion `expect(headerValues).not.toContain(...)` is
falsifiable under CR-015 — if the key were injected into a response header the assertion
would fail. This aspect is met.

### Automated aspect — `docker-compose.yml` includes the `frontend` service

`docker-compose.yml` line 75: `frontend:` service is present with `depends_on: - backend`,
port `3000:3000`, and the correct volume mount
`./apps/frontend/config.docker.json5:/app/apps/frontend/config.override.json5:ro`.
The volume mount path matches the `config.override.json5` path the nconf hierarchy reads
(line 34–38 of `server/config/index.ts`). This aspect is met on inspection.

### Manual aspect — `Dockerfile` builds without error

The developer must run the following commands from the repository root and confirm both
exit with code 0:

```bash
pnpm --filter frontend build
docker build -f apps/frontend/Dockerfile -t ik-frontend-test .
```

`pnpm --filter frontend build` compiles Next.js. `docker build` exercises the full
multi-stage Dockerfile (deps → devdeps → builder → runtime). Both must succeed.

### Manual aspect — stack starts with frontend service

The developer should confirm the frontend service starts correctly within Docker Compose:

```bash
docker compose up frontend backend postgres
```

Then confirm the Hono server is reachable at `http://localhost:3000` and that the backend
is reachable from the frontend container via `http://backend:4000` (the Docker Compose
service name set by `config.docker.json5`).

---

## Findings

### Blocking

None.

### Suggestions

**Suggestion 1 — `config.json5`: add a comment noting the key must match the backend**

File: `apps/frontend/config.json5`, line 5

The `express.internalKey` value `"dev-frontend-key"` must match `auth.frontendKey` in
`apps/backend/config.json5`. There is currently no inline comment making this dependency
explicit. Adding a comment (e.g. `// must match auth.frontendKey in apps/backend/config.json5`)
would make it harder for future developers to rotate the key on one side without noticing
the other. The round 3 review raised this as Suggestion 1 and it remains outstanding.

**Suggestion 2 — `config.docker.json5`: add a comment noting the key inheritance**

File: `apps/frontend/config.docker.json5`

The file already contains a comment explaining that keys not listed here inherit from
`config.json5`. A one-line addition noting that `express.internalKey` is intentionally
absent — inherited from the base config, and must be overridden by the operator before any
non-local deployment — would make the security intent visible at the override file level
rather than only in the task spec. This is purely a readability suggestion.

---

## Summary

**Outcome**: Pass

The round 3 blocking finding (`config.docker.json5` missing `express.internalKey`) is
resolved by the task spec update: the spec now explicitly records that the key is
intentionally omitted from the Docker override and inherits from `config.json5`. Spec and
implementation are aligned.

All acceptance condition clauses are met (automated aspects confirmed by code inspection;
manual `docker build` and stack-start steps require developer execution — standard for a
`both` condition type). No blocking findings remain.

Task status set to `review_passed`.

The review is ready for the user to check.
