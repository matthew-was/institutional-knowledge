# Code Review — Python Service — Task 10: `LLMService` interface and `OllamaLLMAdapter`

**Date**: 2026-04-12 20:04
**Task status at review**: in_review
**Review round**: 2 (first review raised B-001 and B-002, resolved by rewriting the config
narrowing rule in `development-principles-python.md` rather than changing the code; four
suggestions from round 1 also addressed)

**Files reviewed**:

- `shared/interfaces/llm_service.py`
- `shared/adapters/ollama_llm.py`
- `shared/factories/llm_factory.py`
- `tests/pipeline/test_llm_combined_pass.py`

---

## Acceptance condition

**Restated**: Unit tests in `tests/pipeline/test_llm_combined_pass.py` confirm: (1) a valid
structured JSON LLM response is parsed into `LLMCombinedResult` with correct field values;
(2) a malformed JSON response causes the method to return `None`; (3) a missing required
field in the LLM response causes Pydantic `ValidationError` and returns `None`; (4)
`create_llm_service()` returns `OllamaLLMAdapter` when config sets `llm.provider = "ollama"`.

**Condition type**: automated

**Result**: Met

- Condition (1): `test_valid_json_response` mocks a valid Ollama response and asserts
  `result.chunks[0].text`, `result.metadata_fields["description"]`, `result.entities[0].name`,
  and `result.relationships[0].relationship_type`. All assertions directly test parsed field
  values — falsifiable.
- Condition (2): `test_malformed_json_response_returns_none` mocks `"response": "not json"`
  and asserts `result is None`. Falsifiable — `json.JSONDecodeError` path is exercised.
- Condition (3): `test_missing_response_field_returns_none` omits the `chunks` key from the
  mocked response JSON, triggering a Pydantic `ValidationError` that is caught and returns
  `None`. Falsifiable.
- Condition (4): `test_llm_service_creates_ollama_service` calls `create_llm_service` with
  `PROVIDER="ollama"` and asserts `isinstance(llm_service, OllamaLLMAdapter)`. Directly
  tests the factory return type. Falsifiable.

---

## Findings

### Blocking

**B-001 — Uncaught `KeyError` on `data["response"]` in `combined_pass`**

File: `shared/adapters/ollama_llm.py`, line 128

```python
json_data = json.loads(data["response"])
```

`data` is the parsed JSON body from the Ollama HTTP response. If the Ollama API returns
a JSON body that does not contain a `"response"` key (for example if the API shape changes,
or if an error response is returned in a format `raise_for_status()` does not catch), this
line raises `KeyError`. That exception is not listed among the caught exception types
(`httpx.TransportError`, `httpx.HTTPStatusError`, `json.JSONDecodeError`, `ValidationError`)
and will propagate to the caller as an unhandled exception. The method's contract is to
return `None` on any parse or HTTP failure — a propagating `KeyError` violates that contract.

What must change: add `KeyError` to the caught exception types, or replace the dict lookup
with `.get("response")` and handle the `None` case before calling `json.loads`.

---

### Suggestions

**S-001 — `dict` without type parameters on `metadata_fields`**

Files: `shared/interfaces/llm_service.py` line 37; `shared/adapters/ollama_llm.py` line 46

Both `LLMCombinedResult.metadata_fields` and `_LLMCombinedResultModel.metadata_fields` are
annotated as bare `dict`. In Python's type system `dict` is shorthand for `dict[Any, Any]`,
which bypasses static analysis in the same way as a bare `Any`. The Type Annotation Standard
prohibits `Any` without an inline justification comment. Consider annotating as
`dict[str, Any]` with a brief comment (e.g. `# metadata structure varies by document type`),
and importing `Any` from `typing`. This is a Suggestion rather than blocking because the
`metadata_fields` structure is deliberately variable and the field is discarded in Phase 1
(ADR-036), making a more precise type genuinely unavailable at this stage.

**S-002 — Redundant `isinstance(llm_service, LLMService)` in test 4**

File: `tests/pipeline/test_llm_combined_pass.py`, line 100

`test_llm_service_creates_ollama_service` contains two `isinstance` assertions (lines 100
and 101). The second (`isinstance(llm_service, OllamaLLMAdapter)`) directly tests acceptance
condition (4) and is correct. The first (`isinstance(llm_service, LLMService)`) is redundant:
`OllamaLLMAdapter` inherits from `LLMService`, so passing line 101 guarantees line 100 also
passes. The first assertion adds no independent regression protection. Consider removing it
to leave only the assertion that is specific to the acceptance condition.

**S-003 — `close()` method is not on the `LLMService` interface**

File: `shared/adapters/ollama_llm.py`, line 56; `shared/interfaces/llm_service.py`

`OllamaLLMAdapter.close()` is a concrete method with no corresponding abstract method on
`LLMService`. Code at the composition root (e.g. `app.py`) that needs to clean up the
underlying `httpx.Client` cannot call `close()` through the interface — it must know the
concrete type, which violates the Infrastructure as Configuration principle. The startup
sequence shown in the principles file calls `await http_client.aclose()` through the
`HttpClientBase` interface. Consider adding `close() -> None` as an abstract method to
`LLMService` so the composition root can call it through the interface. Note that Task 11
and later tasks will wire the service into the composition root and will need this.

**S-004 — `LLMConfig.CHUNKING_MIN_TOKENS` and `CHUNKING_MAX_TOKENS` lack field constraints**

File: `shared/config.py`, lines 28–29

Both fields are declared as plain `int` with no `Annotated[int, Field(gt=0)]` constraint.
Per the Config Field Constraints principle, numeric config fields whose minimum value is
required for correct runtime behaviour (not merely sensible operation) should carry a Pydantic
`Field` constraint so the invalid range is statically unreachable. A `CHUNKING_MIN_TOKENS`
of 0 or below would make the merge condition in Task 11's post-processing logic
(`token_count < CHUNKING_MIN_TOKENS`) always or never trigger in unexpected ways. The same
applies to `CHUNKING_MAX_TOKENS`. Consider `Annotated[int, Field(gt=0)]` for both. This
is a Suggestion rather than blocking because: (a) the principle document reserves blocking
status for values that would cause "incorrect behaviour" and the post-processing logic is
implemented in Task 11, not Task 10; and (b) `LLMConfig` is owned by Task 10 so adding the
constraint here is the correct place — but the impact is only observable at Task 11.

---

## Summary

**Outcome**: Fail

B-001 is a blocking finding. The `combined_pass` method's stated contract is to return `None`
on any parse or HTTP failure. An uncaught `KeyError` on the `data["response"]` access
violates that contract by allowing an exception to propagate instead. The fix is contained to
a single line in `shared/adapters/ollama_llm.py`.

Task status set to `review_failed`.

The review is ready for the user to check.
