# Code Review — Python Service — Task 5: `OCRService` interface and adapters

**Date**: 2026-04-02 16:16
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/interfaces/ocr_service.py`
- `services/processing/pipeline/adapters/docling_ocr.py`
- `services/processing/pipeline/adapters/tesseract_ocr.py`
- `services/processing/pipeline/factories/ocr_factory.py`
- `services/processing/tests/pipeline/test_ocr_extraction.py`

---

## Acceptance condition

The acceptance condition (type: automated) requires:

1. Both adapters implement the `OCRService` interface — instantiation succeeds and all
   abstract methods are present.
2. `create_ocr_service()` returns a `DoclingAdapter` when config sets `ocr.provider =
   "docling"` and a `TesseractAdapter` when `ocr.provider = "tesseract"`.
3. `create_ocr_service()` raises `ValueError` for an unrecognised provider string.
4. Tests use mock config values — no real document files required.

**Result**: Partially met — see blocking finding B-001 (missing `@pytest.mark.ci_integration`
marker on all three test functions).

The three test functions cover all three conditions above:

- `test_docling_ocr_service_instantiation` monkeypatches `PROVIDER` to `"docling"`, calls
  `create_ocr_service`, and asserts `isinstance(adapter, OCRService)` and
  `isinstance(adapter, DoclingAdapter)`. Python's ABC machinery raises `TypeError` at
  instantiation if any abstract method is unimplemented, so a successful `isinstance` check
  confirms both conditions 1 and 2 for the Docling case.
- `test_tesseract_ocr_service_instantiation` covers condition 2 for the Tesseract case
  in the same way.
- `test_unknown_ocr_service_instantiation` monkeypatches `PROVIDER` to `"unknown"` and
  asserts `ValueError` is raised with the exact expected message, covering condition 3.

All three tests use monkeypatched config values — no real document files are required.

The assertions are falsifiable: `isinstance(adapter, DoclingAdapter)` would fail if the
factory returned a `TesseractAdapter` (or any other type); the `ValueError` assertion would
fail if `create_ocr_service` did not raise, or raised with a different message.

The acceptance condition will be fully met once the test tier marker is applied (B-001).

---

## Findings

### Blocking

**B-001 — Missing `@pytest.mark.ci_integration` on all three tests**

File: `services/processing/tests/pipeline/test_ocr_extraction.py`, lines 11, 18, 25

All three test functions use `monkeypatch` to patch a dependency (`config.PROCESSING.OCR`).
The Python testing strategy in `development-principles-python.md` is explicit: "If reaching
the logic under test requires constructing a service or mocking a dependency, it is not a
unit test — write a Tier 2 test instead." Tier 2 tests must carry the
`@pytest.mark.ci_integration` marker (per the Testing Strategy section).

These tests mock the config singleton and construct adapter instances via the factory — they
are Tier 2 (CI integration) tests, not Tier 1 unit tests. All three functions must be
decorated with `@pytest.mark.ci_integration`.

**B-002 — `extract_text` defined as `async` in interface and adapters — undocumented
divergence from plan**

Files: `services/processing/pipeline/interfaces/ocr_service.py` line 17;
`services/processing/pipeline/adapters/docling_ocr.py` line 14;
`services/processing/pipeline/adapters/tesseract_ocr.py` line 14

The senior developer plan (Step 1 interface specification) defines the signature as:

```text
extract_text(file_path: str) -> OCRResult
```

The implementation adds `async`, making the return type a coroutine. This changes the
calling contract for Task 6 (`ocr_extraction.py`) and all downstream consumers — they must
`await` the call. Making an OCR call async is a reasonable design choice for I/O-bound
operations, but the plan does not record this decision and the divergence is undocumented.

The developer must either: (a) update the plan to record the `async` decision and confirm it
is intentional, or (b) remove `async` from the interface and adapters to match the plan.
This must be resolved before Task 6 is started, as Task 6 depends on the calling contract.

---

### Suggestions

**S-001 — `if/elif/else` pattern in factory vs. plan style**

File: `services/processing/pipeline/factories/ocr_factory.py`, lines 12–18

The `development-principles-python.md` factory example uses two separate `if` statements
followed by a bare `raise`, rather than `if/elif/else`. The implementation uses `if/elif/else`,
which is functionally identical. Either form is acceptable; this is a style note only.

**S-002 — `supports_file_type` returns `True` inside a branch instead of returning the
expression directly**

Files: `services/processing/pipeline/adapters/docling_ocr.py` lines 17–19;
`services/processing/pipeline/adapters/tesseract_ocr.py` lines 17–19

The current pattern is:

```python
if file_extension.lower() in ["pdf", "png", "jpg", "tiff"]:
    return True
return False
```

This can be expressed more concisely and idiomatically as:

```python
return file_extension.lower() in {"pdf", "png", "jpg", "tiff"}
```

Using a set literal (`{}`) rather than a list (`[]`) also avoids a linear scan. Not required
— the current code is clear — but worth noting for consistency with the Python style the rest
of the service uses.

---

## Summary

**Outcome**: Fail

Two blocking findings:

- **B-001**: All three test functions are missing the `@pytest.mark.ci_integration` marker
  required for Tier 2 tests that mock dependencies.
- **B-002**: `extract_text` is defined as `async` throughout the interface and both adapters,
  diverging from the plan's synchronous signature without a recorded decision. The developer
  must either update the plan or revert the `async` modifier.

Task status set to `review_failed`.

The review is ready for the user to check.
