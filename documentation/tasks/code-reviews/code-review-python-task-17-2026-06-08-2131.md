# Code Review — Python Service — Task 17: Response synthesis (`query/response_synthesis.py`)

**Date**: 2026-06-08 21:31
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/query/response_synthesis.py`
- `services/processing/shared/interfaces/llm_service.py`
- `services/processing/shared/adapters/ollama_llm.py`
- `services/processing/tests/fakes/llm_service.py`
- `services/processing/tests/query/test_response_synthesis.py`

---

## Acceptance condition

**Restated**: Automated tests in `tests/query/test_response_synthesis.py` confirm using a
mocked `LLMService`: (1) citation markers in the LLM response are mapped to the correct
source chunks; (2) when the LLM response contains no citation markers, `citations` is an
empty list; (3) when the assembled context is empty (no relevant documents), `no_results =
True` and `response_text` explicitly states no relevant documents were found (UR-099).

**Condition type**: automated

**Result**: Met

All three acceptance conditions have explicit, falsifiable test functions:

1. `test_citation_markers_map_to_correct_source_chunks` (line 64): injects two distinct chunks
   (`chunk-a`/`doc-001` and `chunk-b`/`doc-002`), provides an LLM response referencing both
   `[Citation 1]` and `[Citation 2]`, and asserts the `chunk_id`, `document_id`,
   `document_description`, and `document_date` on each resolved citation. Deleting the
   citation-parsing logic would break these assertions.

2. `test_no_citation_markers_in_response_returns_empty_citations` (line 121): provides a
   non-empty context but an LLM response with no citation markers, and asserts
   `result.citations == []`. Deleting the `_extract_citation_numbers` call would cause the
   list to contain an entry for the single available chunk rather than be empty.

3. `test_empty_assembled_context_returns_no_results_without_llm_call` (line 153): passes
   empty `AssembledContext` and asserts `no_results is True` and `"No relevant documents" in
   result.response_text`. The injected `_ErrorLLM` raises `AssertionError` if `synthesize()`
   is called, confirming the early-return path.

---

## Findings

### Blocking

**B-001** — `_ErrorLLM` fake defined inline in test file
(`tests/query/test_response_synthesis.py`, line 166)

`_ErrorLLM` is a full implementation of the `LLMService` ABC injected into
`synthesize_response()` as its `llm_service` argument. This makes it a fake by the
definition used throughout the project. The development principles (Python service) and the
prohibited-pattern table are explicit:

> "Fake implementations of service ABCs (`OCRService`, `LLMService`, `EmbeddingService`)
> must live in `tests/fakes/<service_name>.py`, not defined inline in a test file —
> blocking if violated."

The class must be moved to `tests/fakes/llm_service.py` and exported from there, either as
a named top-level class (e.g. `ErrorLLMService`) or via a factory function
(e.g. `create_error_llm_service()`). The test imports it from the fakes module.

As a secondary consequence of defining `_ErrorLLM` inline, its `combined_pass` method
carries an incorrect return type annotation (`-> None` instead of `-> LLMCombinedResult |
None`), which required a `# type: ignore[override]` suppression. Moving the class to the
fakes module and giving it the correct return type annotation removes the need for this
suppression.

---

### Suggestions

**S-001** — `_SynthesisResponseModel` defined but never used
(`services/processing/shared/adapters/ollama_llm.py`, line 67–68)

The private Pydantic model `_SynthesisResponseModel` is defined in the adapter but the
`synthesize()` method (line 295) does not use it. The method extracts `response_text`
directly from the raw response dict via `data.get("response")` and constructs
`SynthesisLLMResult` without passing through the private model.

The development principles describe the intent of this pattern: the private model validates
the external contract, and a `ValidationError` surfaces immediately if the Ollama response
shape changes. For the simple synthesis case (`{"response": "<text>"}`) the direct access
is functionally correct, but the unused class is dead code and the inconsistency with the
`combined_pass` and `understand_query` patterns will confuse future readers.

Options: either apply the pattern consistently (parse through `_SynthesisResponseModel`
using `model_validate`, then extract `response_text` from the parsed model before returning
`SynthesisLLMResult`) or remove `_SynthesisResponseModel` entirely and add a comment
explaining why the pattern is inapplicable here.

**S-002** — Plan divergence: `CitationResult` field list
(`documentation/tasks/senior-developer-python-plan.md`, line 779)

The plan specifies `archive_reference_hint` as a field on `CitationResult`. The task spec
(python-tasks.md, lines 1248–1250) resolves this differently: the fields are `chunk_id`,
`document_id`, `document_description`, and `document_date` — with an explicit note that
archive reference derivation is left to the caller. The implementation correctly follows the
task spec.

The plan should be updated to replace `archive_reference_hint` with `document_id` to keep
the plan consistent with the resolved contract. This is a documentation update only; no
code change is required.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): `_ErrorLLM` defined inline in the test file violates the
fakes placement rule. It must be moved to `tests/fakes/llm_service.py` before the task
can advance. Once moved, the `# type: ignore[override]` suppression on `combined_pass`
can also be eliminated by correcting the return type annotation.

Two suggestions (S-001, S-002): the unused `_SynthesisResponseModel` class and a plan
document update. Neither blocks the task.

Task status set to `review_failed`.

The review is ready for the user to check.
