# Code Review — Python Service — Chore 1: Narrow AppConfig to sub-configs in existing adapters and factories

**Date**: 2026-04-13 16:58
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/adapters/http_client.py`
- `services/processing/shared/factories/http_client.py`
- `services/processing/pipeline/adapters/docling_ocr.py`
- `services/processing/pipeline/adapters/tesseract_ocr.py`
- `services/processing/pipeline/factories/ocr_factory.py`
- `services/processing/pipeline/factories/metadata_factory.py`
- `services/processing/tests/shared/test_http_client.py`
- `services/processing/tests/pipeline/test_ocr_extraction.py` (call-site check)
- `services/processing/tests/pipeline/test_pattern_metadata.py` (call-site check)

## Acceptance condition

**Condition**: All seven files updated so that adapters receive only the sub-config they require;
factories narrow before passing; `ruff check services/processing/` passes;
`python3 -m pytest services/processing/tests/ -m ci_integration` passes with no regressions.

**Condition type**: automated

**Result**: Met

All seven files named in the chore spec have been updated. A grep for `config: AppConfig` across
the entire `services/processing/` tree returns no results — `AppConfig` now appears only in
`shared/config.py` (definition, loader, and return type). No adapter or factory takes the full
config bag. Manual verification of the ruff and pytest commands is required per the instructions
below.

**Manual verification the developer must run:**

```bash
pnpm --filter processing exec ruff check services/processing/
python3 -m pytest services/processing/tests/ -m ci_integration
```

Both commands must exit with a zero exit code.

## Findings

### Blocking

None.

### Suggestions

None.

## Summary

**Outcome**: Pass

Every file named in the chore spec accepts only the narrowest sub-config it requires:

- `HttpClient.__init__` and `create_http_client` accept `AuthConfig` + `ServiceConfig` (separate
  args, not `AppConfig`).
- `DoclingAdapter.__init__` and `TesseractAdapter.__init__` accept `OCRConfig`.
- `create_ocr_service` accepts `OCRConfig`.
- `create_metadata_extractor` accepts `MetadataConfig`.
- `tests/shared/test_http_client.py` constructs `AuthConfig` and `ServiceConfig` independently
  and passes them as keyword arguments to the factory — the narrowing is at the test call site,
  matching the pattern the rule requires.
- `tests/pipeline/test_ocr_extraction.py` constructs `OCRConfig` directly and passes it to
  `create_ocr_service` — no change to call-site shape was needed here since the test was already
  constructing the sub-config type, but the import of `OCRConfig` from `shared.config` is correct.
- `tests/pipeline/test_pattern_metadata.py` similarly constructs `MetadataConfig` directly.

Task status set to `review_passed`.

The review is ready for the user to check.
