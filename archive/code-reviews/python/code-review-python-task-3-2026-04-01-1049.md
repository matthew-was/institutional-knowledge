# Code Review — Python Service — Task 3: HTTP client (`shared/http_client.py`)

**Date**: 2026-04-01 10:49
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/interfaces/http_client.py`
- `services/processing/shared/adapters/http_client.py`
- `services/processing/shared/factories/http_client.py`
- `services/processing/tests/shared/test_http_client.py`
- `services/processing/tests/conftest.py`

## Acceptance condition

The acceptance condition is **automated**. A pytest unit test in
`tests/shared/test_http_client.py` must confirm:

1. The `x-internal-key` header is added to every outgoing request using the value
   from config
2. A request body with Python snake\_case keys is serialised to camelCase JSON before
   sending
3. On a simulated 503 response the client retries up to `RETRY_COUNT` times before
   raising `ExpressCallError`
4. On a simulated 401 response the client raises `ExpressCallError` immediately (no retry)

All assertions use mocked HTTP transport (`respx`) — no live Express server required.

**Result**: Met

All four conditions are covered by falsifiable tests:

1. `test_auth_header` (line 70): `assert request.headers["x-internal-key"] == config.AUTH.EXPRESS_KEY`
2. `test_serialization_snake_to_camel` (lines 107–108): `assert request_body["topK"] == 5`,
   `assert "top_k" not in request_body`
3. `test_fail_on_multiple_5xx` (line 148): `assert respx_mock.calls.call_count == config.SERVICE.HTTP.RETRY_COUNT`,
   `assert exc_info.value.status_code == 503`
4. `test_4xx_immediate_return` (lines 160–161): `assert respx_mock.calls.call_count == 1`,
   `assert exc_info.value.status_code == 401`

Each assertion would fail if the corresponding code path were deleted or stubbed to a no-op.

## Findings

### Blocking

None.

### Suggestions

**S-001 — `_with_retry` implicit `None` return when `RETRY_COUNT = 0`**

File: `services/processing/shared/adapters/http_client.py`, line 41

The method is annotated `-> T` but if `config.SERVICE.HTTP.RETRY_COUNT` is `0` the
`range(0)` loop body never executes. No `return` and no `raise` is reached, so the
method returns `None` implicitly. In practice this cannot happen with the current
`settings.json` value of `3`, and config validation would be the correct defence.
However, a strict type checker (`mypy --strict`) would flag this as a missing return
statement. Consider adding a guard after the loop:

```python
msg = "RETRY_COUNT must be >= 1"
raise ValueError(msg)
```

or asserting `RETRY_COUNT >= 1` in the `ServiceHTTPConfig` Pydantic validator so the
implicit-None path is statically unreachable. This is a suggestion, not blocking, because
the `settings.json` default of `3` and Pydantic validation on `int` type together make
the zero case unreachable in practice.

**S-002 — Missing module docstring on `shared/interfaces/http_client.py` and
`shared/factories/http_client.py`**

Files: `services/processing/shared/interfaces/http_client.py` (line 1),
`services/processing/shared/factories/http_client.py` (line 1)

The ADR Citation Standard in `development-principles-python.md` says every source file
should include a one-line module docstring citing the relevant ADR where one exists.
ADR-044 governs the HTTP client. The adapter file (`shared/adapters/http_client.py`)
carries the docstring correctly; the interface and factory files do not. This is a
minor consistency gap — not blocking.

**S-003 — `log.warn(...)` vs `log.warning(...)`**

File: `services/processing/shared/adapters/http_client.py`, lines 49 and 65

`structlog.BoundLogger` exposes `warning()` as the standard method name (matching the
Python standard library logging module). `warn()` is a deprecated alias in structlog
and may be removed in a future major version. Prefer `log.warning(...)` for
forward-compatibility.

## Summary

**Outcome**: Pass

All four acceptance condition assertions are present, correctly wired to mocked transport,
and falsifiable. The round-1 blocking finding (B-001: no test for exhausted retries) is
resolved — `test_fail_on_multiple_5xx` mocks `RETRY_COUNT` consecutive 503 responses,
asserts `call_count == config.SERVICE.HTTP.RETRY_COUNT`, and asserts `ExpressCallError`
is raised with `status_code == 503`. The three suggestions (S-001 through S-003) are
optional improvements.

Task status set to `review_passed`.

The review is ready for the user to check.
