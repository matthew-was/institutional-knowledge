# Code Review — Python Service — Task 14: Query understanding

**Date**: 2026-05-27 15:38
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/interfaces/llm_service.py`
- `services/processing/shared/adapters/ollama_llm.py`
- `services/processing/query/query_understanding.py`
- `services/processing/tests/query/test_query_understanding.py`
- `services/processing/tests/fakes/llm_service.py`
- `services/processing/tests/pipeline/test_llm_combined_pass.py`

---

## Acceptance condition

**Stated condition** (automated): Unit tests in `tests/query/test_query_understanding.py`
confirm using a mocked `LLMService`: (1) a valid structured JSON response is parsed into
`QueryUnderstandingResult` with correct field values; (2) a malformed JSON response triggers
the safe fallback and returns `intent = "unknown"` and `refined_search_terms = <original
query>`; (3) the fallback does not raise an unhandled exception.

**Result**: Partially met — conditions (1) is met; conditions (2) and (3) have a structural gap.

**Condition (1) — valid JSON parsed correctly**: The test
`test_valid_response_parsed_into_result_with_correct_field_values` injects a fake
`LLMService` that returns a pre-built `QueryUnderstandingResult` and asserts all five
fields (`intent`, `refined_search_terms`, `extracted_entities`, `routing_hint`,
`confidence`). This correctly confirms that `run_query_understanding()` passes the result
through and that `QueryUnderstandingResult` holds the expected values. **Met.**

**Conditions (2) and (3) — malformed JSON fallback**: Both tests inject a fake
`LLMService` whose `understand_query()` directly returns a pre-built fallback
`QueryUnderstandingResult`. This confirms that `run_query_understanding()` passes through
whatever the service returns — but it does not verify that malformed JSON from the LLM
(Ollama) actually triggers the fallback. The fallback logic lives in
`OllamaLLMAdapter.understand_query()`, which is bypassed entirely by the fake.

The acceptance condition states "a malformed JSON response triggers the safe fallback" —
this is a property of the adapter's error-handling path (`json.JSONDecodeError` and
`ValidationError` catch blocks in `OllamaLLMAdapter.understand_query()`), not of the step
function. No test exercises these catch blocks. The analogous test for `combined_pass()`
in `test_llm_combined_pass.py` uses `respx` to intercept the HTTP call and return
`{"response": "not json"}`, verifying that the adapter itself handles the error. No
equivalent test exists for `understand_query()`. **Not met — blocking finding B-001.**

---

## Findings

### Blocking

**B-001 — Acceptance conditions (2) and (3) not tested at the adapter level**

`tests/query/test_query_understanding.py` lines 60–112.

Tests for conditions (2) and (3) inject a fake that directly returns the fallback result.
This confirms `run_query_understanding()` passes results through, but does not verify that
`OllamaLLMAdapter.understand_query()` actually catches `json.JSONDecodeError` and
`ValidationError` and returns the fallback rather than raising. These catch blocks are the
substance of conditions (2) and (3).

What must change: add at least two tests (analogous to the `respx`-based tests in
`test_llm_combined_pass.py`) that call `OllamaLLMAdapter.understand_query()` directly with
`respx`-intercepted Ollama HTTP responses:

- One that returns `{"response": "not json"}` — confirms `json.JSONDecodeError` catch
  → fallback with `intent == "unknown"` and `refined_search_terms == original_query`
- One that returns a structurally valid JSON body that fails Pydantic validation (e.g. a
  missing required field) — confirms `ValidationError` catch → same fallback

These can live in `tests/query/test_query_understanding.py` or a sibling adapter test
file. They must carry `@pytest.mark.ci_integration`. The existing fake-based tests may
remain as they confirm the step function's pass-through behaviour.

---

**B-002 — `Any` without justification comment in `QueryUnderstandingResult`**

`services/processing/shared/interfaces/llm_service.py` line 48.

```python
extracted_entities: list[dict[str, Any]] = field(default_factory=list)
```

The type annotation standard prohibits `Any` without an inline comment explaining why it
cannot be avoided. The `extracted_entities` field contains dicts with only two string
values (`name` and `type`), making `dict[str, str]` a tighter and correct type that would
eliminate the need for `Any` entirely.

What must change: either narrow the type to `list[dict[str, str]]` (removing the `Any`
import if it is then unused for this field) or add an inline comment justifying `Any`.
Narrowing to `dict[str, str]` is the preferred fix — it is accurate given that
`_ExtractedEntityModel` only has `name: str` and `type: str`, and the conversion step in
`ollama_llm.py` line 259 produces exactly `{"name": e.name, "type": e.type}`. If
`dict[str, str]` is chosen, update the import and the `ollama_llm.py` annotation for the
conversion expression accordingly.

---

### Suggestions

**S-001 — Factory type mismatch will need resolving before the query pipeline is wired**

`services/processing/shared/factories/llm_factory.py` line 10.

`create_llm_service(config: LLMConfig, ...)` requires `LLMConfig`, which extends
`LLMBaseConfig` with `CHUNKING_MIN_TOKENS` and `CHUNKING_MAX_TOKENS` (constrained with
`Field(gt=0)` and a `model_validator`). However, `QueryConfig.LLM` is typed as
`LLMBaseConfig` — it has no chunking fields.

When the query pipeline is wired in a later task (a `create_query_service` call in
`app.py`), passing `app_config.QUERY.LLM` directly to `create_llm_service()` will fail
mypy because `LLMBaseConfig` is not assignable to `LLMConfig`. Options: (a) create a
separate `create_llm_service_for_query(config: LLMBaseConfig, ...) -> LLMService` factory;
or (b) make `OllamaLLMAdapter.__init__` accept `LLMBaseConfig` directly (since it only
uses `config.MODEL` and `config.BASE_URL`). This is not a Task 14 issue because the step
function receives an injected `LLMService` and does not call the factory — raise at the
task that wires the query service.

---

**S-002 — `log.warn()` should be `log.warning()`**

`services/processing/shared/adapters/ollama_llm.py` lines 249, 278, 284.

`structlog` exposes both `.warn()` and `.warning()` — `.warn()` is a deprecated alias.
For consistency with structlog's canonical API, prefer `.warning()`. The existing
`combined_pass()` method uses `.error()` throughout; `understand_query()` introduces
`.warn()` for the first time.

---

**S-003 — `# noqa: BLE001` comment is redundant**

`services/processing/tests/query/test_query_understanding.py` line 107.

The `BLE` ruleset (flake8-blind-except) is not in the project's ruff `select` list
(`"E", "F", "I", "UP", "ANN"`). The `# noqa: BLE001` comment suppresses a rule that is
not enabled, making it a no-op. The broad `except Exception` is an appropriate pattern in
this test (intentional, to confirm no exception escapes). Remove the noqa comment or note
its redundancy.

---

## Summary

**Outcome**: Fail

Two blocking findings:

- **B-001**: Acceptance conditions (2) and (3) require that malformed JSON from the LLM
  triggers the adapter's safe fallback. No test exercises the adapter's `JSONDecodeError`
  or `ValidationError` catch blocks — the fake bypasses the adapter entirely. Tests using
  `respx`-intercepted responses must be added.
- **B-002**: `extracted_entities: list[dict[str, Any]]` uses `Any` without a justification
  comment. The correct type is `list[dict[str, str]]`, which eliminates the need for `Any`.

The review is ready for the user to check.
