# Code Review — Python Service — Task 17: Response synthesis

**Date**: 2026-06-08 21:44
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/query/response_synthesis.py`
- `services/processing/shared/interfaces/llm_service.py`
- `services/processing/shared/adapters/ollama_llm.py`
- `services/processing/tests/fakes/llm_service.py`
- `services/processing/tests/query/test_response_synthesis.py`

---

## Acceptance condition

**Restated**: Unit tests in `tests/query/test_response_synthesis.py` confirm using a mocked
`LLMService`: (1) citation markers in the LLM response are mapped to the correct source
chunks; (2) when the LLM response contains no citation markers, `citations` is an empty list;
(3) when the assembled context is empty (no relevant documents), `no_results = True` and
`response_text` explicitly states no relevant documents were found (UR-099).

**Condition type**: automated

**Result**: Met (via fake injection — the three test functions cover all three conditions).

- `test_citation_markers_map_to_correct_source_chunks` — uses two-chunk context; asserts
  `chunk_id`, `document_id`, `document_description`, and `document_date` on each citation.
  Assertions are specific and falsifiable. Acceptance condition 1 is met.
- `test_no_citation_markers_in_response_returns_empty_citations` — asserts `citations == []`
  after an LLM response containing no `[Citation N]` markers. Falsifiable. Acceptance
  condition 2 is met.
- `test_empty_assembled_context_returns_no_results_without_llm_call` — uses
  `create_error_llm_service()` (raises if called); asserts `no_results is True` and
  `"No relevant documents" in result.response_text`. Falsifiable. Acceptance condition 3 is
  met.

All three tests carry `@pytest.mark.ci_integration`. Correct — these are Tier 2 tests (they
construct a fake service and call the async step function; no direct I/O, but service wiring
is involved).

---

## Findings

### Blocking

**B-001 — `_SynthesisResponseModel` field name does not match the Ollama response body field;
`synthesize()` will fail at runtime**

File: `services/processing/shared/adapters/ollama_llm.py`, lines 67–68 and 308–312.

The Ollama `/api/generate` endpoint returns a JSON body whose text output field is named
`response`. The `combined_pass` and `understand_query` methods both extract this correctly:

```python
response_data = data.get("response")   # extracts the "response" key
json_data = json.loads(response_data)  # then parses the JSON string inside it
```

The S-001 fix added `_SynthesisResponseModel` and changed the `synthesize()` method to call
`_SynthesisResponseModel.model_validate(data)` on the full response body. However,
`_SynthesisResponseModel` declares:

```python
class _SynthesisResponseModel(BaseModel):
    response_text: str
```

The Ollama response body does not contain a `response_text` key — it contains `response`.
Calling `model_validate(data)` on the raw Ollama JSON body will always raise
`ValidationError` at runtime because the required field `response_text` is absent.

The synthesis response is also plain text, not an embedded JSON string, so the parsing
pattern differs from `combined_pass` and `understand_query`. The private Pydantic model
pattern is correct in principle (required by the Private Pydantic Parsing Models standard),
but the model field name must match Ollama's actual field name (`response`, not
`response_text`).

What must change: the `_SynthesisResponseModel` field name and `synthesize()` must be
corrected so parsing succeeds against the actual Ollama response body. The field should be
named `response` (matching Ollama's JSON key), and the returned `SynthesisLLMResult` should
be constructed using that field's value.

Note: the test suite does not catch this because all three acceptance-condition tests inject
`create_mock_llm_service_for_synthesis()`, which bypasses `OllamaLLMAdapter.synthesize()`
entirely. An adapter-level test against a respx mock would catch this immediately.

---

### Suggestions

**S-001 — No adapter-level test for `synthesize()` with a respx mock**

The prior review's S-001 was an adapter-level concern. The fix applied the Pydantic model
pattern (correct in principle), but no adapter-level test using respx was added to validate
that `OllamaLLMAdapter.synthesize()` correctly handles the Ollama HTTP response — including
the field name, error propagation on HTTP failure, and the raise-on-failure contract (which
differs from `combined_pass` and `understand_query`). Without this, the field-name mismatch
in B-001 was not caught.

Adding a test analogous to those in `tests/query/test_query_understanding.py` (lines
120–166), using a respx mock that returns the actual Ollama JSON shape, would provide
immediate regression protection for this boundary. This is a suggestion, not a blocker,
because the acceptance conditions for Task 17 are met by the existing tests against the
abstract interface.

---

## Summary

**Outcome**: Fail

One blocking finding: the `_SynthesisResponseModel` in `ollama_llm.py` declares field
`response_text`, but the Ollama `/api/generate` API returns field `response`. The
`synthesize()` method calls `model_validate(data)` on the raw Ollama response body and will
always raise `ValidationError` at runtime. The acceptance-condition tests do not catch this
because they inject a fake that bypasses the adapter.

Task status set to `review_failed`.

The review is ready for the user to check.
