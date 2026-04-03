# Code Review — Python Service — Task 6: OCR extraction step

**Date**: 2026-04-03 15:29
**Task status at review**: in_review
**Round**: 2 (re-review after round-1 suggestions actioned)
**Files reviewed**:

- `services/processing/pipeline/steps/ocr_extraction.py`
- `services/processing/tests/pipeline/test_ocr_extraction.py`
- `services/processing/tests/fakes/ocr_service.py`
- `services/processing/tests/fakes/__init__.py`
- `documentation/tasks/python-tasks.md` (Task 6 section — S-001 verification)
- `documentation/tasks/senior-developer-python-plan.md` (S-001 verification)

## Round-1 suggestions — verification

**S-001** — `retry_on_next_trigger` removed from plan and task docs.

Verified. The string `retry_on_next_trigger` does not appear in either
`senior-developer-python-plan.md` or `python-tasks.md`. The Task 6 description now
reads: "retry logic is Express's responsibility via `attempt_count` in `pipeline_steps`;
Python does not carry a retry flag".

**S-002** — Mock OCR service helpers moved to `tests/fakes/ocr_service.py`.

Verified. `services/processing/tests/fakes/ocr_service.py` exists and exports
`create_mock_ocr_service` and `create_error_ocr_service`. The test file imports these
at line 14:

```python
from tests.fakes.ocr_service import create_error_ocr_service, create_mock_ocr_service
```

No inline mock class definitions remain in the test file.

`tests/fakes/__init__.py` is present (empty file, correct Python package marker).

**S-003** — Implicit truthiness replaced with explicit comparisons.

Verified. Both lines in `ocr_extraction.py` use `s.strip() == ""`:

- Line 75: `if all(s.strip() == "" for s in ocr_result.text_per_page):`
- Line 89: `if any(s.strip() == "" for s in ocr_result.text_per_page):`

The inner loop at line 92 also uses `if value.strip() == "":`, consistent with the
change.

## Acceptance condition

**Condition**: Unit tests in `tests/pipeline/test_ocr_extraction.py` confirm all four
cases with a mocked `OCRService`: (1) zero-page document returns `step_status =
"completed"` with one flag of type `"extraction_failure"`; (2) all-empty-pages document
returns `step_status = "completed"` with one flag of type `"extraction_failure"`; (3)
partial-text document returns `step_status = "completed"` with one flag of type
`"partial_extraction"` whose reason names the zero-text pages; (4) file-open failure
returns `step_status = "failed"` with a non-empty error message. Each case is a separate
test function.

**Condition type**: automated

**Result**: Met

- Case 1 — `test_zero_page_document_extraction`: asserts `step_status == "completed"`,
  `len(result.document_flags) == 1`, `document_flags[0].type == "extraction_failure"`,
  and the exact reason string. Correct.
- Case 2 — `test_empty_pages_extraction`: asserts `step_status == "completed"`,
  `document_flags[0].type == "extraction_failure"`, reason `"No extractable text from
  any page"`. Correct.
- Case 3 — `test_empty_partial_extraction`: asserts `step_status == "completed"`,
  `document_flags[0].type == "partial_extraction"`, reason `"Pages [1, 3] returned no
  text"`. Names the zero-text pages. Correct.
- Case 4 — `test_file_open_error`: asserts `step_status == "failed"`,
  `error_message == "error opening file"` (non-empty). Correct.

Each case is a separate test function, all marked `@pytest.mark.ci_integration`.

## Findings

### Blocking

None.

### Suggestions

None.

## Summary

**Outcome**: Pass

All three round-1 suggestions have been correctly applied. No new issues were introduced.
Task status set to `review_passed`.

The review is ready for the user to check.
