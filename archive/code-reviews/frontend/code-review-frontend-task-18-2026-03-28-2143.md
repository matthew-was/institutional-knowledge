# Code Review — Frontend Service — Task 18: Frontend configuration file and Docker setup

**Date**: 2026-03-28 21:43
**Task status at review**: in_review
**Round**: 3 (re-review)
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
  `"http://backend:4000"` instead of `"http://localhost:4000"`) and B-002
  (`config.docker.json5` `express.baseUrl` was `"http://host.docker.internal:4000"`).
- **Round 2**: B-002 fixed. B-001 remained — developer pushed back with sound architectural
  rationale (nconf override pattern). Reviewer required either the spec or the implementation
  to be updated to achieve alignment.
- **Round 3**: The caller confirms the task spec has been updated to align with the
  implementation. The spec now explicitly describes `config.json5` as the local-dev default
  (`http://localhost:4000`) and `config.docker.json5` as the Docker override
  (`http://backend:4000`) via the nconf override layer. The spec and implementation are now
  aligned on this point.

---

## Acceptance condition

**Restated**: `config.json5` exists with all required keys; `Dockerfile` builds without error
(`docker build`); `docker-compose.yml` includes the `frontend` service; the
`express.internalKey` does not appear in any response header (verified by Tier 2 test from
Task 2).

**Condition type**: both

**Result**: Partially met — automated aspect met; manual aspect requires developer action.

### Automated aspect — `express.internalKey` not in response headers

`apps/frontend/server/__tests__/server.test.ts` line 13: the security test reads
`testConfig.express.internalKey` and asserts its value is absent from all response header
values. The test uses `expect(headerValues).not.toContain(testConfig.express.internalKey)` —
falsifiable under CR-015 (if the key were injected into a header, the assertion would fail).
This aspect is met.

### Automated aspect — `config.json5` exists with all required keys

`apps/frontend/config.json5` contains:

- `server.host: "localhost"` — present (not listed in spec but structurally required by config schema)
- `server.port: 3000` — present, matches spec
- `express.baseUrl: "http://localhost:4000"` — present, matches updated spec
- `express.internalKey: "dev-frontend-key"` — present; value differs from spec's `"change-me-in-production"` (see Suggestion 1)
- `upload.maxFileSizeMb: 50` — present, matches spec
- `upload.acceptedExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"]` — present, matches spec (order differs; not a concern)

All required keys from the acceptance condition clause are present. This aspect is met.

### Manual aspect — `Dockerfile` builds without error

The developer must run the following command from the repository root and confirm it exits
with code 0:

```bash
pnpm --filter frontend build
docker build -f apps/frontend/Dockerfile -t ik-frontend-test .
```

The `pnpm --filter frontend build` step compiles Next.js. The `docker build` step exercises
the multi-stage Dockerfile. Both must succeed for this aspect to be met.

### Manual aspect — `docker-compose.yml` includes the `frontend` service

`docker-compose.yml` line 75: `frontend:` service is present, `depends_on: - backend`,
port `3000:3000` exposed, volume mount `./apps/frontend/config.docker.json5:/app/apps/frontend/config.override.json5:ro`.
This aspect is met on inspection; the developer should confirm the stack starts:

```bash
docker compose up frontend backend postgres
```

---

## Findings

### Blocking

**Finding 1 — `config.docker.json5`: `express.internalKey` is absent**

File: `apps/frontend/config.docker.json5`

The task specification explicitly lists `express.internalKey: "change-me-in-production"` as a
required key for `config.docker.json5`. The implementation omits it entirely — the file
contains only `express.baseUrl`.

From a functional standpoint, omitting the key from the override is architecturally valid:
the nconf hierarchy inherits `express.internalKey: "dev-frontend-key"` from `config.json5`,
and Docker Compose authentication works as long as both frontend and backend use matching keys.
However, the spec's intent for including this key in the override is clearly to make the
production-rotation point explicit — the operator mounts `config.docker.json5` as the
override and sees the key there, which prompts rotation before production use.

This is the same class of divergence as B-001: the implementation and spec differ, and the
resolution requires either updating the spec to reflect the omission or adding the key to the
implementation. As with B-001, this reviewer cannot retroactively rewrite what the spec
requires — the developer must choose one path.

**What must change**: either (a) add `express.internalKey: "change-me-in-production"` to
`config.docker.json5` as the spec requires; or (b) update the task spec to note that
`express.internalKey` is inherited from `config.json5` in the Docker environment and is only
overridden by a `config.override.json5` mounted by the operator, and that `config.docker.json5`
deliberately omits it. The developer must choose one path and execute it.

### Suggestions

**Suggestion 1 — `config.json5`: `express.internalKey` value**

File: `apps/frontend/config.json5`, line 5

The task spec lists `"change-me-in-production"` as the value. The implementation uses
`"dev-frontend-key"`, which matches `apps/backend/config.json5` `auth.frontendKey:
"dev-frontend-key"` — so shared-key authentication works correctly in local dev without any
further configuration.

The value is functionally correct. Using `"change-me-in-production"` would break local dev
out of the box unless the developer also updates the backend config. `"dev-frontend-key"` is
a reasonable local-dev default. Consider either aligning the spec value or adding a comment
to `config.json5` noting that this key must match `apps/backend/config.json5`
`auth.frontendKey` and must be rotated before any non-local deployment.

---

## Summary

**Outcome**: Fail

B-001 from round 2 is resolved — the task spec has been updated to align with the
`localhost` base-config pattern. The spec and implementation are now aligned on
`config.json5`.

A new finding: `config.docker.json5` is missing `express.internalKey`, which the task spec
explicitly lists as a required key for that file. The same resolution path applies — the
spec and implementation must be aligned. The developer must either add the key or update the
spec.

Task status set to `review_failed`.

The review is ready for the user to check.
