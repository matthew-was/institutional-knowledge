# Code Review — Python Service — Task 5: `OCRService` interface and adapters

**Date**: 2026-04-02 16:51
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/interfaces/ocr_service.py`
- `services/processing/pipeline/adapters/docling_ocr.py`
- `services/processing/pipeline/adapters/tesseract_ocr.py`
- `services/processing/pipeline/factories/ocr_factory.py`
- `services/processing/tests/pipeline/test_ocr_extraction.py`

**Round**: 2 (previous review: `code-review-python-task-5-2026-04-02-1616.md`)

---

## Acceptance condition

The acceptance condition (type: automated) requires:

1. Both adapters implement the `OCRService` interface — instantiation succeeds and all
   abstract methods are present.
2. `create_ocr_service()` returns a `DoclingAdapter` when config sets `ocr.provider =
   "docling"` and a `TesseractAdapter` when `ocr.provider = "tesseract"`.
3. `create_ocr_service()` raises `ValueError` for an unrecognised provider string.
4. Tests use mock config values — no real document files required.

**Result**: Met.

All three conditions are covered by falsifiable tests in
`services/processing/tests/pipeline/test_ocr_extraction.py`:

- `test_docling_ocr_service_instantiation` monkeypatches `config.PROCESSING.OCR.PROVIDER`
  to `"docling"`, calls `create_ocr_service`, and asserts both `isinstance(adapter,
  OCRService)` and `isinstance(adapter, DoclingAdapter)`. Python's ABC machinery raises
  `TypeError` at instantiation if any abstract method is unimplemented, so a successful
  instantiation confirms that all required methods are present. The `isinstance(adapter,
  DoclingAdapter)` assertion would fail if the factory returned a `TesseractAdapter` or any
  other type — it is falsifiable for the purpose of confirming correct adapter selection.
- `test_tesseract_ocr_service_instantiation` covers condition 2 for the Tesseract case in
  the same way.
- `test_unknown_ocr_service_instantiation` monkeypatches `PROVIDER` to `"unknown"` and
  asserts `ValueError` is raised with the exact expected message
  (`"unknown is not a supported OCR Provider"`). The assertion is falsifiable: removing
  the `raise ValueError` branch in the factory would cause the test to fail.
- All three tests use monkeypatched config values — no real document files are required.
- All three tests carry the `@pytest.mark.ci_integration` marker, correctly classifying
  them as Tier 2 (they mock a dependency via `monkeypatch`).

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All blocking findings from round 1 (B-001: missing `@pytest.mark.ci_integration` markers;
B-002: `async` on `extract_text`) have been resolved. Both suggestions (S-001: factory
style; S-002: `supports_file_type` returning expression directly using a set literal) have
also been applied.

The implementation is fully compliant with the plan, the ADR-011 interface specification,
the ADR-042 module boundary, and the Python testing strategy.

Task status set to `review_passed`.

The review is ready for the user to check.
