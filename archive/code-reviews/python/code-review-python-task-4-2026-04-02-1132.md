# Code Review — Python Service — Task 4: Auth middleware (`app.py` — inbound key validation)

**Date**: 2026-04-02 11:32
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/app.py`
- `services/processing/tests/test_app.py`
- `services/processing/pytest.ini`
- `services/processing/pyproject.toml`
- `.claude/agents/pair-programmer.md`

## Acceptance condition

**Restated**: A pytest test in `tests/test_app.py` confirms: (1) `GET /health` returns 200
with `{"status": "ok"}` without any auth header; (2) `POST /process` with a correct
`x-internal-key` header returns 501; (3) `POST /process` with an incorrect key returns 401;
(4) `POST /process` with no `x-internal-key` header returns 401; (5) `POST /query` with no
`x-internal-key` header returns 401. All tests use `httpx.AsyncClient` with the FastAPI
`TestClient` pattern.

**Condition type**: automated

**Result**: Met

All five conditions are covered by the five tests in `tests/test_app.py`:

1. `test_health_route_no_auth` — GET /health, no auth header → 200 + `{"status": "ok"}`
2. `test_api_success_with_auth` — POST /process, correct key → 501 + detail confirmed
3. `test_api_process_fail_with_wrong_auth` — POST /process, wrong key → 401
4. `test_api_process_fail_with_no_auth` — POST /process, no header → 401
5. `test_api_query_fail_with_no_auth` — POST /query, no header → 401

All five tests use `httpx.AsyncClient` with `httpx.ASGITransport(app=app)`. Each assertion is
falsifiable: removing or disabling the middleware would cause tests 3, 4, and 5 to fail
(they would return 501 instead of 401); altering the health bypass would cause test 1 to
fail; disabling the 501 stub would cause test 2 to fail.

**Note on test tier**: The task description uses the term "unit test" but the tests are
correctly marked `@pytest.mark.ci_integration`. Under `development-principles-python.md`
(Testing Strategy), tests that construct a service (via `httpx.ASGITransport` which exercises
the full ASGI stack) are Tier 2, not Tier 1. The marker is correct. The task description
wording is imprecise — the implementation follows the right principle.

## Findings

### Blocking

None.

### Suggestions

**1. `app.py` imports `config` as a module-level singleton — plan shows lifespan injection**

`services/processing/app.py`, line 8: `from shared.config import config`

The `development-principles-python.md` lifespan pattern shows config being loaded inside the
`lifespan` context manager and attached to `app.state.deps`. The current implementation
imports the module-level singleton directly, making the middleware's key value fixed at import
time rather than injectable.

For Task 4's narrow scope (auth middleware + stubs only), this is workable — the config
module is designed as a singleton and the test reads `VALID_KEY = config.AUTH.INBOUND_KEY`
from the same singleton, so behaviour is consistent. The concern is forward-looking: when
the lifespan context manager is added in a later task (wiring pipeline and query), the auth
key read in the middleware should be sourced from `app.state` alongside the other deps, for
consistency and testability.

This is a suggestion rather than a blocking finding because the lifespan wiring is
explicitly deferred to later tasks, and the current approach does not break the acceptance
condition or any principle directly. The developer should consider aligning the config
source when the lifespan context is added.

**2. Plan text for `AUTH` config keys uses camelCase — implementation is correct but plan is stale**

`documentation/tasks/senior-developer-python-plan.md`, lines 970–972 and 1054–1058: the plan
shows `inboundKey: str` and refers to `auth.inboundKey` (camelCase). The implementation
correctly uses `INBOUND_KEY` (UPPER_SNAKE_CASE) per the Config Key Casing Standard
established in Task 2. The plan text predates the casing standard and was not updated.

The code is correct; the plan is stale. The developer may want to update the plan's config
model snippet and config key references for accuracy, but this does not affect any
current-task output.

## Summary

**Outcome**: Pass

No blocking findings. The middleware is correctly implemented, the health bypass works as
specified, the stub routes return 501 as required, and all five acceptance condition tests
are present and falsifiable. The `@pytest.mark.ci_integration` marker is correct per the
testing tier rules. The housekeeping changes (`pytest.ini`, `pyproject.toml`,
`pair-programmer.md`) are appropriate.

Task status set to `review_passed`.

The review is ready for the user to check.
