# Code Review — Python Service — Task 14: Query understanding (re-review)

**Date**: 2026-05-27 20:05
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/interfaces/llm_service.py`
- `services/processing/shared/factories/llm_factory.py`
- `services/processing/shared/adapters/ollama_llm.py`
- `services/processing/tests/query/test_query_understanding.py`
- `services/processing/tests/fakes/llm_service.py`

---

## Acceptance condition

**Stated condition** (automated): Unit tests in `tests/query/test_query_understanding.py`
confirm using a mocked `LLMService`: (1) a valid structured JSON response is parsed into
`QueryUnderstandingResult` with correct field values; (2) a malformed JSON response triggers
the safe fallback and returns `intent = "unknown"` and `refined_search_terms = <original
query>`; (3) the fallback does not raise an unhandled exception.

**Result**: Met.

**Condition (1)**: `test_valid_response_parsed_into_result_with_correct_field_values` (line 44)
injects a fake `LLMService` returning a pre-built `QueryUnderstandingResult` and asserts all
five fields. Met.

**Conditions (2) and (3) — adapter-level coverage**: Two new `respx`-based tests added in
this round exercise `OllamaLLMAdapter.understand_query()` directly:

- `test_malformed_json_response_triggers_fallback` (line 132): mocks Ollama returning
  `{"response": "not json"}`, asserts `result.intent == "unknown"` and
  `result.refined_search_terms == original_query`. Exercises the `json.JSONDecodeError`
  catch block.
- `test_validation_error_response_triggers_fallback` (line 150): mocks Ollama returning
  valid JSON missing required fields (`intent`, `refined_search_terms`, `confidence`),
  asserts the same fallback values. Exercises the `ValidationError` catch block.

Both tests carry `@pytest.mark.ci_integration` and `@respx.mock`, following the pattern
established in `test_llm_combined_pass.py`. The full Ollama URL
(`http://test:11434/api/generate`) is used in the mock, consistent with `make_adapter()`
which sets `BASE_URL="http://test:11434"`. Conditions (2) and (3) are met.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All three findings from the previous review have been correctly addressed:

- **B-001**: Two `respx`-based adapter tests added (`test_malformed_json_response_triggers_fallback`,
  `test_validation_error_response_triggers_fallback`). Both carry `@pytest.mark.ci_integration`,
  call `OllamaLLMAdapter.understand_query()` directly, and assert the fallback values.
  The acceptance condition is now fully met.
- **B-002**: `extracted_entities` narrowed from `list[dict[str, Any]]` to `list[dict[str, str]]`
  in `llm_service.py` line 48. The `Any` import remains (still required for
  `metadata_fields: dict[str, Any]` which carries an inline comment justifying it).
- **S-001**: Comment added to `llm_factory.py` documenting the `QueryConfig.LLM` /
  `LLMConfig` type mismatch and recommending a separate `create_llm_service_for_query()`
  factory when the query service is wired.
- **S-002**: All three `.warn()` calls replaced with `.warning()` in `ollama_llm.py`
  (lines 249, 278, 284). No remaining `.warn()` calls in the file.
- **S-003**: Redundant `# noqa: BLE001` comment removed from `test_query_understanding.py`.

Task status set to `review_passed`.

The review is ready for the user to check.
