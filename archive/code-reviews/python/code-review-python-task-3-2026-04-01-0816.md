# Code Review — Python Service — Task 3: HTTP client (`shared/http_client.py`)

**Date**: 2026-04-01 08:16
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/http_client.py`
- `services/processing/tests/shared/test_http_client.py`

---

## Acceptance condition

A pytest unit test in `tests/shared/test_http_client.py` confirms:

1. The `x-internal-key` header is added to every outgoing request using the value from config.
2. A request body with Python snake_case keys is serialised to camelCase JSON before sending.
3. On a simulated 503 response the client retries up to `RETRY_COUNT` times before raising `ExpressCallError`.
4. On a simulated 401 response the client raises `ExpressCallError` immediately (no retry).

All assertions use mocked HTTP transport — no live Express server is required.

**Condition type**: automated

**Result**: Not met — condition (3) is not satisfied.

- Condition (1): Met. `test_auth_header` asserts `request.headers["x-internal-key"] == config.AUTH.EXPRESS_KEY`. Falsifiable.
- Condition (2): Met. `test_serialization_snake_to_camel` asserts `request_body["topK"] == 5` and `"top_k" not in request_body`. Falsifiable.
- Condition (3): **Not met.** `test_retry_on_500` mocks a 503 followed by a 200 and asserts `call_count == 2` and `response.accepted`. This tests successful recovery after one retry — not exhaustion. The acceptance condition requires a test that confirms the client retries up to `RETRY_COUNT` times and then raises `ExpressCallError`. A separate test is needed: mock `RETRY_COUNT` consecutive 503 responses and assert that `ExpressCallError` is raised and that `call_count == RETRY_COUNT`. This is a blocking finding.
- Condition (4): Met. `test_4xx_immediate_return` asserts `call_count == 1` and `exc_info.value.status_code == 401`. Falsifiable.

---

## Findings

### Blocking

**B-001 — Acceptance condition (3) not met: exhaustion path not tested**

File: `services/processing/tests/shared/test_http_client.py`, test `test_retry_on_500` (line 101)

`test_retry_on_500` mocks a 503 response followed by a 200 response. It asserts `call_count == 2`
and that a successful response is returned. This verifies that the client can recover after one
retry — it does not verify that the client retries exactly `RETRY_COUNT` times before raising
`ExpressCallError` when all attempts fail.

A second test is required that:

- Mocks `RETRY_COUNT` consecutive 503 responses (all failing — no success response in the sequence)
- Asserts that `ExpressCallError` is raised
- Asserts that `call_count == RETRY_COUNT` (i.e. the client retried the full configured number of times, not more or fewer)

Without this test, the exhaustion branch in `_with_retry` is untested and the acceptance condition
is not met.

---

### Suggestions

**S-001 — Missing `@pytest.mark.ci_integration` markers**

File: `services/processing/tests/shared/test_http_client.py`, all test functions

Per `development-principles-python.md` (Testing Strategy — Tier 2), CI integration tests that
mock HTTP transport with `respx` must be marked `@pytest.mark.ci_integration`. None of the
four tests carry this marker. `ci_integration` is already registered in `pytest.ini`. Without
the marker these tests cannot be selectively included or excluded via `-m ci_integration`.

**S-002 — No logging in `_with_retry`**

File: `services/processing/shared/http_client.py`, method `_with_retry` (line 34)

The `development-principles-python.md` Logging Standard requires `warn` for recoverable
unexpected conditions ("Fallback taken, retrying after transient error") and `error` for
non-recoverable failures ("Express unreachable after retries, malformed response"). The
`_with_retry` method retries silently and raises `ExpressCallError` without logging either
event. Callers will have no structured record of which endpoint was retried, how many attempts
were made, or what the final error was.

**S-003 — No `aclose()` method on `HttpClient`**

File: `services/processing/shared/http_client.py`, class `HttpClient`

`development-principles-python.md` (Dependency Composition Pattern) shows the lifespan calling
`await http_client.aclose()` at shutdown to close the underlying `httpx.AsyncClient`. The current
`HttpClient` class exposes no `aclose()` method. When Task 4 wires the lifespan this will produce
an `AttributeError` at shutdown. A one-line delegation method (`async def aclose(self) -> None:
await self.client.aclose()`) would resolve this.

**S-004 — No abstract `HttpClient` interface**

File: `services/processing/shared/http_client.py`

The `development-principles-python.md` HTTP Client Pattern section and the plan's module
structure diagram show the abstract `HttpClient` ABC living in `shared/interfaces/http_client.py`
with the concrete class as a separate file. The current implementation places the concrete class
directly in `shared/http_client.py` with no ABC. The task specification describes the concrete
implementation, so this is not a requirement of Task 3, but the deviation from the plan means
downstream tasks that depend on the interface (e.g. factory functions, test fakes) will need to
work against the concrete class rather than an abstraction. Consider whether to extract the ABC
before more tasks build on this file.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the test for acceptance condition (3) tests successful recovery
after a retry but does not test that the client exhausts all retries and raises `ExpressCallError`
when all attempts fail. A second test covering the exhaustion path is required.

Task status set to `review_failed`.

The review is ready for the user to check.
