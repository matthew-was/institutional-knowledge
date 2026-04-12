# Code Review — Python Service — Task 10: `LLMService` interface and `OllamaLLMAdapter`

**Date**: 2026-04-12 15:56
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/interfaces/llm_service.py`
- `services/processing/shared/adapters/ollama_llm.py`
- `services/processing/shared/factories/llm_factory.py`
- `services/processing/tests/pipeline/test_llm_combined_pass.py`

---

## Acceptance condition

**Restated** (type: automated): Unit tests in `tests/pipeline/test_llm_combined_pass.py` confirm:
(1) a valid structured JSON LLM response is parsed into `LLMCombinedResult` with correct field
values; (2) a malformed JSON response causes the step to return `None`; (3) a missing required
field causes Pydantic `ValidationError` and returns `None`; (4) `create_llm_service()` returns
`OllamaLLMAdapter` when config sets `llm.provider = "ollama"`.

**Result**: Not met — one acceptance condition test has a blocking structural issue (see B-001
below), and the factory under test does not accept the correct config type (see B-002 below),
which means condition (4) is not testing the function with the signature it will have in
production.

---

## Findings

### Blocking

**B-001 — `create_llm_service` factory accepts `LLMConfig` instead of `AppConfig`**

`services/processing/shared/factories/llm_factory.py`, line 10:

```python
def create_llm_service(config: LLMConfig, log: structlog.BoundLogger) -> LLMService:
```

The config narrowing rule in `development-principles-python.md` (Dependency Composition
Pattern section) states: "factories accept `AppConfig` and do the narrowing before passing
config to adapters. Adapters and concrete implementations accept only the sub-config they
actually need."

The factory currently accepts `LLMConfig` (a sub-config). This pushes the narrowing
responsibility to the caller (`app.py` would need to pass `config.PROCESSING.LLM` rather
than `config`). The established pattern, visible in `shared/factories/http_client.py` and
`pipeline/factories/ocr_factory.py`, is that the factory accepts `AppConfig` and narrows
internally.

The adapter (`OllamaLLMAdapter`) correctly accepts `LLMConfig` — no change needed there.
What must change: the factory signature must be updated to accept `AppConfig`, with the
narrowing done inside the factory before calling the adapter.

The correct form:

```python
def create_llm_service(config: AppConfig, log: structlog.BoundLogger) -> LLMService:
    if config.PROCESSING.LLM.PROVIDER == "ollama":
        return OllamaLLMAdapter(config=config.PROCESSING.LLM, log=log)
    raise ValueError(f"{config.PROCESSING.LLM.PROVIDER} is not a supported LLM Service Provider")
```

---

**B-002 — Test 4 passes `LLMConfig` directly to `create_llm_service`, bypassing the factory's
expected signature**

`services/processing/tests/pipeline/test_llm_combined_pass.py`, lines 92–104:

The test constructs a `LLMConfig` and calls `create_llm_service(config=config, ...)`. Once
B-001 is resolved and the factory accepts `AppConfig`, this test will fail to call the factory
correctly. The test must be updated to pass a valid `AppConfig` (or at minimum a
`ProcessingConfig`-containing structure) so it tests the factory as it actually operates in
production.

Additionally, the test asserts:

```python
assert isinstance(llm_service, LLMService)
assert isinstance(llm_service, OllamaLLMAdapter)
```

Per CR-015, `isinstance` assertions are type-checking expressions that pass regardless of
whether the object actually does what the factory is supposed to guarantee. A more falsifiable
assertion would be to call `combined_pass` with a mocked HTTP response and confirm a
`LLMCombinedResult` is returned — verifying not just the type but that the factory produced
a working adapter. If a mock HTTP call is too complex for this test, at a minimum the test
should add an assertion that the factory raises `ValueError` for an unknown provider (i.e.
add a second test case for the `ValueError` path, as the OCR factory tests do).

Note: the `isinstance` pattern was accepted for the OCR factory test in Task 5. The blocking
element here is specifically that the test is testing the wrong function signature (accepting
`LLMConfig` instead of `AppConfig`), which means the test does not cover the function that
will actually run in production. The `isinstance` concern is a suggestion (see S-001).

---

### Suggestions

**S-001 — Test 4: add a `ValueError` test case for unknown provider**

`services/processing/tests/pipeline/test_llm_combined_pass.py`

The OCR factory tests (`test_ocr_extraction.py`, lines 33–38) include a test that confirms
`create_ocr_service` raises `ValueError` for an unknown provider. No equivalent test exists
for `create_llm_service`. Adding this test would confirm the `raise ValueError` branch is
exercised and that the error message is correct. This mirrors the existing pattern and would
make the factory test suite complete.

---

**S-002 — `test_valid_json_response`: redundant `isinstance` assertion**

`services/processing/tests/pipeline/test_llm_combined_pass.py`, line 42:

```python
assert isinstance(result, LLMCombinedResult)
```

This assertion is redundant because the subsequent field checks (`result.chunks[0].text`,
`result.metadata_fields["description"]`, etc.) would raise `AttributeError` if `result` were
`None` or a wrong type. The `isinstance` check gives no additional protection and is a
type-checking assertion per CR-015. The field-value assertions on lines 43–47 are the
substantive checks. The `isinstance` line can be removed.

---

**S-003 — Unnecessary `# noqa: E501` on a short string**

`services/processing/tests/pipeline/test_llm_combined_pass.py`, line 59:

```python
"response": "not json"  # noqa: E501
```

The `"not json"` string is not long. The `# noqa: E501` comment was presumably copied from
a neighbouring test that does have a long line. It is unnecessary here and should be removed
to avoid the appearance that the line requires suppression.

---

**S-004 — `_build_prompt` could be a module-level function or static method**

`services/processing/shared/adapters/ollama_llm.py`, line 59:

`_build_prompt` takes only `text` and `document_type` as meaningful inputs (the instance
variables `self._model` and `self._log` are not used). It operates as a pure function on its
arguments. Making it a `@staticmethod` (or extracting it as a module-level function) would
make its stateless nature explicit and make it easier to unit-test in isolation in Task 11
if prompt content needs to be verified. This is a readability suggestion.

---

## Summary

**Outcome**: Fail

Two blocking findings:

- **B-001**: `create_llm_service` factory accepts `LLMConfig` instead of `AppConfig`, violating
  the config narrowing rule established in `development-principles-python.md`.
- **B-002**: Test 4 calls the factory with the wrong config type (`LLMConfig`), meaning it
  does not test the function as it will operate in production. Once B-001 is resolved, the
  test must be updated to construct an `AppConfig` and pass it to the factory.

Four suggestions (S-001 through S-004) are noted but not required.

Task status set to `review_failed`.

The review is ready for the user to check.
