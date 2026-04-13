# Code Review — Python Service — Task 10: `LLMService` interface and `OllamaLLMAdapter`

**Date**: 2026-04-12 21:20
**Task status at review**: in_review
**Review round**: 4
**Files reviewed**:

- `shared/interfaces/llm_service.py`
- `shared/adapters/ollama_llm.py`
- `shared/factories/llm_factory.py`
- `tests/pipeline/test_llm_combined_pass.py`
- `shared/config.py` (LLMConfig changes only)

---

## Changes since round 3

- B-001 resolved: `@pytest.mark.ci_integration` removed from `test_llm_service_creates_ollama_service`
  and `test_llm_service_raises_error_for_unknown_provider` — both are now unmarked.
- B-002 resolved: `close(self) -> None` is now declared as `@abstractmethod` on the ABC with
  `self` correctly present.
- S-002 actioned: `LLMConfig` now has `Annotated[int, Field(gt=0)]` on both
  `CHUNKING_MIN_TOKENS` and `CHUNKING_MAX_TOKENS`, and a `@model_validator(mode="after")`
  enforces `MIN < MAX`.
- S-001 (None-as-failure contract) deferred to Task 11 — not raised in this review.

---

## Acceptance condition

**Stated condition** (automated): Unit tests in `tests/pipeline/test_llm_combined_pass.py` confirm
using a mocked `LLMService`:

1. A valid structured JSON LLM response is parsed into `LLMCombinedResult` with correct field
   values.
2. A malformed JSON response causes the step to return status `failed` (not raise an unhandled
   exception).
3. A missing required field in the LLM response causes Pydantic `ValidationError` and returns
   status `failed`.
4. `create_llm_service()` returns `OllamaLLMAdapter` when config sets `llm.provider = "ollama"`.

**Result**: Met (with a clarifying note on item 2 and 3)

- Item 1 — `test_valid_json_response` provides a well-formed Ollama JSON response via
  `respx.mock`, calls `combined_pass`, and asserts field-level values on the returned
  `LLMCombinedResult`. Covered.
- Item 2 — `test_malformed_json_response_returns_none` sends `"response": "not json"`, calls
  `combined_pass`, and asserts `result is None`. The acceptance condition says "return status
  `failed`" but at the adapter level the contract is to return `None` (the pipeline step in
  Task 11 will convert `None` to step status `failed`). The test correctly validates the
  adapter contract at this boundary. Covered.
- Item 3 — `test_missing_response_field_returns_none` omits the required `chunks` field,
  triggering Pydantic `ValidationError`, and asserts `result is None`. The `ValidationError`
  path is caught and handled without raising. Covered.
- Item 4 — `test_llm_service_creates_ollama_service` calls `create_llm_service` with
  `PROVIDER="ollama"` and asserts `isinstance(result, OllamaLLMAdapter)`. Covered.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All four acceptance condition items are met. All round-3 blocking findings (B-001, B-002) are
resolved. Round-3 suggestion S-002 has been actioned. The `LLMConfig` model validator correctly
enforces `CHUNKING_MIN_TOKENS < CHUNKING_MAX_TOKENS` at config load time. The `Any` usage in
`metadata_fields` is justified by an inline comment in both the interface and the adapter.
Module boundary compliance is maintained — `shared/` is the correct location for this
interface. The factory accepts and passes only `LLMConfig`, satisfying the config-narrowing
rule. Tier markers are correct: three respx-mocked tests carry `@pytest.mark.ci_integration`;
the two factory tests are unmarked Tier 1.

Task status set to `review_passed`.

The review is ready for the user to check.
