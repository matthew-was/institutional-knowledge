# Code Review — Python Service — Task 3: HTTP client (`shared/http_client.py`)

**Date**: 2026-04-01 11:00
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/interfaces/http_client.py`
- `services/processing/shared/adapters/http_client.py`
- `services/processing/shared/factories/http_client.py`
- `services/processing/shared/config.py`
- `services/processing/tests/shared/test_http_client.py`
- `services/processing/tests/conftest.py`

## Acceptance condition

The acceptance condition is **automated**. A pytest unit test in
`tests/shared/test_http_client.py` must confirm:

1. The `x-internal-key` header is added to every outgoing request using the value from config
2. A request body with Python snake\_case keys is serialised to camelCase JSON before sending
3. On a simulated 503 response the client retries up to `RETRY_COUNT` times before
   raising `ExpressCallError`
4. On a simulated 401 response the client raises `ExpressCallError` immediately (no retry)

All assertions use mocked HTTP transport (`respx`) — no live Express server required.

**Result**: Met

All four conditions are covered by falsifiable tests, unchanged from round 2:

1. `test_auth_header` (line 70): `assert request.headers["x-internal-key"] == config.AUTH.EXPRESS_KEY`
2. `test_serialization_snake_to_camel` (lines 107–108): `assert request_body["topK"] == 5`,
   `assert "top_k" not in request_body`
3. `test_fail_on_multiple_5xx` (line 148): `assert respx_mock.calls.call_count == config.SERVICE.HTTP.RETRY_COUNT`,
   `assert exc_info.value.status_code == 503`
4. `test_4xx_immediate_return` (lines 160–161): `assert respx_mock.calls.call_count == 1`,
   `assert exc_info.value.status_code == 401`

Each assertion would fail if the corresponding code path were deleted or stubbed to a no-op.

## Round 3 — verification of round 2 suggestions

**S-001 fixed**: `ServiceHTTPConfig.RETRY_COUNT` is now annotated
`Annotated[int, Field(ge=1)]` in `shared/config.py` (line 100). This rules out the
implicit-`None` return path in `_with_retry` at config load time — a zero or negative value
raises a Pydantic `ValidationError` before the client is constructed.

**S-002 fixed**: `shared/interfaces/http_client.py` now carries the module docstring
`"""HttpClientBase — abstract interface for all outbound Express HTTP calls (ADR-044)."""`
(line 1). `shared/factories/http_client.py` carries
`"""Factory for creating the HttpClient adapter (ADR-044)."""` (line 1).

**S-003 fixed**: All occurrences of `log.warn(...)` in `shared/adapters/http_client.py`
have been replaced with `log.warning(...)` (lines 49 and 65).

## Findings

### Blocking

None.

### Suggestions

None.

## Summary

**Outcome**: Pass

All three round 2 suggestions have been correctly actioned. The acceptance condition
remains fully met. No new issues were introduced by the changes. Task status set to
`review_passed`.

The review is ready for the user to check.
