# Code Review — Python Service — Task 6: OCR extraction step

**Date**: 2026-04-03 15:15
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/interfaces/pipeline_models.py`
- `services/processing/pipeline/interfaces/ocr_service.py`
- `services/processing/pipeline/steps/ocr_extraction.py`
- `services/processing/tests/pipeline/test_ocr_extraction.py` (Task 6 tests: lines 40–169)

---

## Acceptance condition

**Restated**: Unit tests in `tests/pipeline/test_ocr_extraction.py` confirm all four cases
with a mocked `OCRService`: (1) zero-page document returns `step_status = "completed"` with
one flag of type `"extraction_failure"`; (2) all-empty-pages document returns
`step_status = "completed"` with one flag of type `"extraction_failure"`; (3) partial-text
document returns `step_status = "completed"` with one flag of type `"partial_extraction"`
whose reason names the zero-text pages; (4) file-open failure returns `step_status = "failed"`
with a non-empty error message. Each case is a separate test function.

**Condition type**: automated

**Result**: Met

All four cases are covered by separate, named test functions:

1. `test_zero_page_document_extraction` (line 52) — asserts `step_status == "completed"`,
   `text_per_page == []`, `len(document_flags) == 1`, `flags[0].type == "extraction_failure"`,
   `flags[0].reason == "Document opened but contains zero pages"`.
2. `test_empty_pages_extraction` (line 72) — asserts `step_status == "completed"`,
   `text_per_page == [""]`, `len(document_flags) == 1`, `flags[0].type == "extraction_failure"`,
   `flags[0].reason == "No extractable text from any page"`.
3. `test_empty_partial_extraction` (line 96) — asserts `step_status == "completed"`,
   `len(document_flags) == 1`, `type == "partial_extraction"`,
   `reason == "Pages [1, 3] returned no text"`.
4. `test_file_open_error` (line 131) — asserts `step_status == "failed"`,
   `error_message == "error opening file"` (non-empty), `text_per_page == []`,
   `len(document_flags) == 0`.

All assertions are falsifiable (CR-015): each would fail if the production code branch it
exercises were removed or stubbed.

All five Task 6 tests are marked `@pytest.mark.ci_integration`, which is correct — they
construct a mock service and therefore cannot be Tier 1 (pure function) tests.

---

## Findings

### Blocking

None.

### Suggestions

**S-001**: `retry_on_next_trigger` field inconsistency between plan narrative and dataclass
definition.

Both the task description (python-tasks.md line 499) and the plan narrative
(senior-developer-python-plan.md line 139–141) state that the file-open failure path should
return `step_status = "failed"` **and** `retry_on_next_trigger: True`. However, the
`ExtractionResult` dataclass definition in both documents (and in the implementation at
`pipeline/steps/ocr_extraction.py`) omits this field entirely. The acceptance condition
only tests for `step_status` and a non-empty `error_message`, so this does not block the
current task, but the inconsistency should be resolved before the orchestrator (Task N that
calls `run_ocr_extraction`) is implemented: either add `retry_on_next_trigger: bool` to
`ExtractionResult` and update the plan, or remove the field from the plan narrative if the
orchestrator does not need it (Express infers retry behaviour from `step_status = "failed"`
alone).

**S-002**: Mock OCR service helpers defined inline in the test file.

`create_mock_ocr_service` and `create_error_ocr_service` (lines 40–48, 120–128) are defined
directly in `tests/pipeline/test_ocr_extraction.py`. The Python development principles state
that fake implementations of `OCRService`, `LLMService`, and `EmbeddingService` live in
`tests/fakes/`. Future pipeline step tests (text quality scoring, LLM combined pass, etc.)
will also need a controllable `OCRService` fake. Moving these helpers to
`tests/fakes/ocr_service.py` now avoids duplication across test files.

**S-003**: Implicit truthiness check on stripped strings (lines 75, 89).

`all(not s.strip() for s in ...)` and `any(not s.strip() for s in ...)` are functionally
correct but use implicit truthiness. The project uses explicit comparisons elsewhere (e.g.
`if data is not None:` at line 33, `if value.strip() == "":` at line 92). For consistency,
prefer `all(s.strip() == "" for s in ...)` and `any(s.strip() == "" for s in ...)`.
This is purely a readability point.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation correctly handles all four outcome paths specified
by the task. The `ExtractionResult` dataclass is properly defined with full type annotations.
`DocumentFlag` is placed in `pipeline/interfaces/pipeline_models.py` as suggested by the task
spec. Logging uses `structlog` with `log.warning` (not `log.warn`). The module boundary
(ADR-042) is respected — no imports from `query/`. All Task 6 tests are marked
`@pytest.mark.ci_integration` and contain falsifiable assertions.

Three suggestions are raised (S-001: plan inconsistency re `retry_on_next_trigger`; S-002:
mock helpers should move to `tests/fakes/`; S-003: explicit string comparison).

Task status set to `review_passed`.

The review is ready for the user to check.
