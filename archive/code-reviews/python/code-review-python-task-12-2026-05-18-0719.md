# Code Review — Python Service — Task 12: `EmbeddingService` interface and `OllamaEmbeddingAdapter`

**Date**: 2026-05-18 07:19
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/interfaces/embedding_service.py` (new)
- `services/processing/shared/adapters/ollama_embedding.py` (new)
- `services/processing/shared/factories/embedding_factory.py` (new)
- `services/processing/tests/shared/test_embedding_service.py` (new)
- `services/processing/shared/config.py` (edited — `EmbeddingConfig.DIMENSION` constraint added)

---

## Acceptance condition

**Condition**: Unit tests in `tests/shared/test_embedding_service.py` confirm using a mocked
`EmbeddingService`: (1) a returned embedding with dimension matching config passes validation;
(2) a returned embedding with a mismatched dimension raises `ValueError`; (3)
`create_embedding_service()` returns `OllamaEmbeddingAdapter` when config sets
`embedding.provider = "ollama"`. All tests use mocked HTTP transport — no live Ollama server
required.

**Condition type**: automated

**Result**: Met

All three stated conditions are covered:

1. `test_matching_dimension_returns_embedding_result` — mocks the HTTP response at the
   `respx` layer; calls `adapter.embed()`; asserts `result.embedding`, `result.dimension`,
   and `result.model` match expected values. Dimension of 3 matches config `DIMENSION=3`.
2. `test_mismatched_dimension_raises_value_error` — config sets `DIMENSION=5`, response
   returns a 3-element vector; asserts `ValueError` with the exact message. Falsifiable.
3. `test_factory_returns_ollama_embedding_service` — calls `create_embedding_service()` with
   `PROVIDER="ollama"`; asserts `isinstance(result, OllamaEmbeddingAdapter)`. Falsifiable.

All tests use `respx.mock` to intercept `httpx` — no live Ollama server required.

The test file also includes five additional tests beyond the acceptance condition (empty
response, missing key, HTTP status error, transport error, unknown provider) which strengthen
coverage. All are reviewed below.

---

## Findings

### Blocking

None.

### Suggestions

**S-001** — `services/processing/tests/shared/test_embedding_service.py`, lines 34–35

`test_matching_dimension_returns_embedding_result` includes:

```python
assert isinstance(adapter, EmbeddingService)
```

This assertion is vacuous in context: `adapter` was constructed directly as
`OllamaEmbeddingAdapter(...)` on the line above. Its type is never in doubt — the assertion
passes unconditionally regardless of what `embed()` does. Per CR-015, an assertion that passes
regardless of the behaviour under test provides no regression protection. Consider removing
this line; the three subsequent assertions on `result` are the substantive checks.

**S-002** — `services/processing/shared/adapters/ollama_embedding.py`, line 28

The Ollama embeddings API uses a `prompt` key for the text input:

```python
payload = {
    "prompt": text,
    ...
}
```

The Ollama `/api/embeddings` endpoint accepts `prompt` but the current Ollama API documentation
describes the field as `input` in some versions. This is not a correctness issue at review
time — both keys are currently accepted — but if the Ollama version is upgraded, the key name
may need to change. Consider adding a brief inline comment noting the API field name and the
Ollama version it targets, so a future upgrade can identify this quickly.

This is a documentation suggestion only — not a blocker.

**S-003** — `services/processing/shared/adapters/ollama_embedding.py`, line 36

The `ValueError` raised for an empty or `None` embedding is:

```python
raise ValueError("ollama embeddings response was empty or None")
```

The message string does not include the actual dimension received or the expected dimension.
For the dimension mismatch on line 42:

```python
raise ValueError(
    "ollama embedding dimension does not match expected length"
)
```

The message similarly omits the actual vs expected values. Including them (e.g.
`f"expected {self._expected_dimension}, got {actual_dimension}"`) would make logs and test
failures more immediately informative. Not blocking.

---

## Summary

**Outcome**: Pass

All three acceptance condition cases are covered by tests using mocked HTTP transport. The
interface/adapter/factory split is correct: ABC in `shared/interfaces/`, concrete adapter in
`shared/adapters/`, factory in `shared/factories/`. Config narrowing is correct: both the
adapter and factory accept `EmbeddingConfig`, not `AppConfig`. `DIMENSION` carries
`Annotated[int, Field(gt=0)]` in `EmbeddingConfig`. Async conventions are correct (`embed`
and `close` are `async def`; `httpx.AsyncClient` is used; `aclose()` is called in `close()`).
LBYL guard is present (`response.json().get("embedding")` with `is None or len() == 0`
check). Transport and HTTP status errors are caught, logged at `error` level, and re-raised.
All new source files carry ADR-024/ADR-042 docstrings. `tests/shared/__init__.py` is present.
No blocking findings.

Task status set to `review_passed`.

The review is ready for the user to check.
