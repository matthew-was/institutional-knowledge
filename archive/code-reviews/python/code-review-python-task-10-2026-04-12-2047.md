# Code Review — Python Service — Task 10: `LLMService` interface and `OllamaLLMAdapter`

**Date**: 2026-04-12 20:47
**Task status at review**: in_review
**Review round**: 3
**Files reviewed**:

- `shared/interfaces/llm_service.py`
- `shared/adapters/ollama_llm.py`
- `shared/factories/llm_factory.py`
- `tests/pipeline/test_llm_combined_pass.py`

---

## Acceptance condition

**Stated condition** (automated): Unit tests in `tests/pipeline/test_llm_combined_pass.py` confirm
using a mocked `LLMService`:

1. A valid structured JSON LLM response is parsed into `LLMCombinedResult` with correct field values.
2. A malformed JSON response causes the step to return status `failed` (not raise an unhandled exception).
3. A missing required field in the LLM response causes Pydantic `ValidationError` and returns status `failed`.
4. `create_llm_service()` returns `OllamaLLMAdapter` when config sets `llm.provider = "ollama"`.

**Result**: Partially met — see blocking finding B-001 below.

Conditions 1, 4, and the `ValueError` variant (test 5) are met by tests 1, 4, and 5. However,
conditions 2 and 3 are not directly distinguishable by the tests from condition 1: both tests 2 and 3
assert `result is None` — which is the correct return value — but neither test carries `@respx.mock`
and uses `respx_mock`. More critically, **the test file uses `@pytest.mark.ci_integration` on every
test**, which contradicts the Tier 1/Tier 2 boundary rule. See B-001.

---

## Findings

### Blocking

**B-001 — All tests are marked `@pytest.mark.ci_integration` but some require no I/O**

`tests/pipeline/test_llm_combined_pass.py` marks every test with `@pytest.mark.ci_integration`.
Tests 4 (`test_llm_service_creates_ollama_service`) and 5
(`test_llm_service_raises_error_for_unknown_provider`) construct a `LLMConfig`, call
`create_llm_service()`, and assert the return type or raised error — no HTTP call is made, no
`@respx.mock` is applied, and no external service is touched. These are pure factory tests.

Per the development-principles-python.md testing strategy:

> Tier 1 tests must not carry `@pytest.mark.ci_integration` — they run unconditionally everywhere.
> The marker is reserved for Tier 2.

Tests 4 and 5 are Tier 1 by the project's definition: they call a function directly and assert
the output with zero I/O. Carrying `@pytest.mark.ci_integration` on them is the anti-pattern
explicitly listed in the "What These Principles Rule Out" table:

> `@pytest.mark.ci_integration` on a Tier 1 test — Tier 1 tests run unconditionally — the marker
> is redundant and creates false Tier 2 signals.

**What must change**: Remove `@pytest.mark.ci_integration` from tests 4 and 5. Tests 1, 2, and 3
correctly use `@respx.mock` + `respx_mock` to intercept HTTP and remain Tier 2 with the marker.

**B-002 — `close()` abstract method is missing `self` parameter**

`shared/interfaces/llm_service.py` line 51:

```python
@abstractmethod
def close() -> None: ...
```

The `self` parameter is absent. This is not a Python syntax error (it is valid as a static-like
method body inside a class), but it means `LLMService.close` is an `abstractmethod` that does not
receive the instance — it cannot be called as `service.close()` in the normal way. The concrete
`OllamaLLMAdapter.close(self) -> None` at line 58 of `ollama_llm.py` has the correct signature,
so the adapter itself works. However, callers that hold an `LLMService` reference and call
`service.close()` will pass the instance as the first positional argument to the abstract method
stub, which accepts zero arguments. Python will raise `TypeError` at call time if the ABC stub is
invoked directly (e.g. via `super().close()`), and static analysis tools will flag callers.

**What must change**: Add `self` as the first parameter: `def close(self) -> None: ...`

---

### Suggestions

**S-001 — `combined_pass` return type is `LLMCombinedResult | None` on the ABC but the task acceptance condition uses the return value to signal failure**

The interface declares `combined_pass(...) -> LLMCombinedResult | None` and the adapter returns
`None` for all error paths. The acceptance condition tests assert `result is None`. This is a
workable contract for Phase 1. However, the plan's description says "on JSON parse failure returns
step status `failed`" — the step wrapper (Task 11) will need to distinguish a `None` from
the adapter from a genuine empty result. Consider whether a future `LLMCombinedResult` with an
empty `chunks` list is a valid success. This is not a blocking issue for Task 10 but worth
noting for Task 11 design.

**S-002 — `CHUNKING_MIN_TOKENS` and `CHUNKING_MAX_TOKENS` constraints (S-004 from review 2, noted as not actioned)**

`shared/config.py` uses `Field(gt=0)` for both `CHUNKING_MIN_TOKENS` and `CHUNKING_MAX_TOKENS`.
This prevents zero or negative values but does not enforce that `CHUNKING_MIN_TOKENS <
CHUNKING_MAX_TOKENS`. A misconfiguration where min exceeds max would cause undefined chunk
post-processing behaviour in Task 11. A Pydantic `model_validator` could enforce the invariant.
This remains a suggestion — not blocking for Task 10 since the post-processing logic lives in
Task 11.

---

## Summary

**Outcome**: Fail

Two blocking findings:

- **B-001**: Tests 4 and 5 carry `@pytest.mark.ci_integration` but make no I/O and are Tier 1 by
  the project's definition. The marker must be removed.
- **B-002**: The `close()` abstract method on `LLMService` is missing the `self` parameter,
  introduced when resolving S-003 from review 2. The concrete adapter's `close(self)` is correct;
  the ABC stub must match.

The review is ready for the user to check.
