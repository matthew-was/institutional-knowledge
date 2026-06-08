# Code Review — Python Service — Task 17: Response synthesis (`query/response_synthesis.py`)

**Date**: 2026-06-08 21:52
**Task status at review**: in_review
**Round**: 3 (first two rounds found B-001 and S-001)
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
chunks; (2) when the LLM response contains no citation markers, `citations` is an empty
list; (3) when the assembled context is empty (no relevant documents), `no_results = True`
and `response_text` explicitly states no relevant documents were found (UR-099).

**Condition type**: automated

**Result**: Met.

- (1) `test_citation_markers_map_to_correct_source_chunks` — builds two `SearchResult`
  chunks, fakes an LLM response containing both `[Citation 1]` and `[Citation 2]`, and
  asserts `chunk_id`, `document_id`, `document_description`, and `document_date` on each
  resolved citation. Removing the citation-marker extraction logic would produce an empty
  `citations` list and fail the `len(result.citations) == 2` assertion.
- (2) `test_no_citation_markers_in_response_returns_empty_citations` — provides a non-empty
  assembled context but a response text with no `[Citation N]` markers. Asserts
  `result.citations == []`. Removing the early-return guard or the citation-parser would not
  affect this test (the parser correctly produces `[]` for no matches), but removing the
  citations list construction entirely would also produce `[]`, making the assertion
  technically falsifiable only via the non-empty path test. Assessed as adequately
  falsifiable in combination with test (1).
- (3) `test_empty_assembled_context_returns_no_results_without_llm_call` — uses
  `create_error_llm_service()` which raises `AssertionError` on any LLM method call. Asserts
  `no_results is True` and `"No relevant documents" in result.response_text`. Removing the
  empty-context guard would cause the LLM fake to raise, immediately failing the test.

---

## Findings

### Blocking

None.

### Suggestions

**S-001** — `tests/query/test_response_synthesis.py`, lines 189–201
`_make_synthesis_adapter()` uses `config.PROCESSING.LLM.CHUNKING_MIN_TOKENS` and
`config.PROCESSING.LLM.CHUNKING_MAX_TOKENS` solely to satisfy `LLMConfig`'s required fields,
even though `synthesize()` never uses chunking token bounds. This construction will fail if
the test config has no `PROCESSING.LLM` section, and it exposes an accidental coupling
between the synthesis adapter test and the pipeline LLM config. Since the adapter tests test
only `synthesize()`, which uses only `MODEL` and `BASE_URL` (plus `PROVIDER` for the
factory), consider whether `LLMConfig` can be extended with default values for the chunking
fields, or whether a test-only minimal config dict would be cleaner. Not blocking — the
adapter is wired correctly and the tests pass — but worth considering for future test
isolation.

**S-002** — Plan divergence: `CitationResult` vs plan specification
The senior developer plan (`senior-developer-python-plan.md`, line 778–781) specifies
`CitationResult` with `chunk_id`, `document_description`, `document_date`, and
`archive_reference_hint`. The task description (python-tasks.md) specifies `chunk_id`,
`document_id`, `document_description`, `document_date` — with `document_id` in place of
`archive_reference_hint`. The implementation follows the task description, which correctly
reflects ADR-023 (archive reference computed by the caller, not Python). The plan's mention
of `archive_reference_hint` was superseded by the task description. The plan's
`response_synthesis.py` section should be updated to reflect the actual `CitationResult`
fields. Not blocking — the implementation is correct per the task file; only the plan is
stale.

---

## Summary

**Outcome**: Pass

Both issues from the prior two review rounds have been addressed correctly:

- **B-001 resolved**: `_SynthesisResponseModel.response` (not `response_text`) now matches
  Ollama's actual `/api/generate` response envelope. `synthesize()` correctly reads
  `parsed.response` and returns it as `SynthesisLLMResult(response_text=parsed.response)`.

- **S-001 resolved**: Three new adapter-level tests with `respx` mocks cover the happy path
  (valid Ollama response shape parses correctly), the missing-field path
  (`ValidationError`/`ValueError` raised when `response` is absent), and the HTTP error
  path (`httpx.HTTPStatusError` propagates without fallback). All three are falsifiable and
  follow the established `respx` mock pattern.

No blocking findings. Task status set to `review_passed`.

The review is ready for the user to check.
