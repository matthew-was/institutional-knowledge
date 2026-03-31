# Code Review — Python Service — Task 2: Config loading (`shared/config.py`)

**Date**: 2026-03-31 14:41
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/config.py`
- `services/processing/tests/shared/test_config.py`
- `services/processing/settings.json`
- `services/processing/tests/shared/settings.test.json`

---

## Acceptance condition

The task requires a pytest unit test in `tests/shared/test_config.py` confirming:

1. Valid `settings.json` produces a populated `AppConfig` instance with correct types.
2. A missing required field (`AUTH.INBOUND_KEY`) causes a Pydantic `ValidationError` at load
   time.
3. An `IK_AUTH__INBOUND_KEY` environment variable overrides the file value.

**Condition type**: automated

**Result**: Met

**Condition (1)** — `test_singleton_config_spot_check` asserts two values from the live module-level
singleton: `config.AUTH.INBOUND_KEY == "dev-python-service-key"` and
`config.PROCESSING.OCR.QUALITY_SCORING.CONFIDENCE_WEIGHT == 0.7`. The second assertion reaches
three levels deep into a nested sub-model, confirming deep Pydantic parsing works. Both
values are present in `settings.json` with the expected values. Both assertions are falsifiable.

**Condition (2)** — `test_config_missing_attribute` calls `_load_config(["tests/shared/settings.test.json"])`.
The fixture file contains all required keys except `AUTH.INBOUND_KEY` (it has `AUTH.EXPRESS_KEY`
only). Because `INBOUND_KEY` is a required field on `AuthConfig` with no default, Pydantic raises
`ValidationError` at model construction. The test asserts `pytest.raises(pydantic.ValidationError)`.
This is falsifiable and correctly targeted.

**Condition (3)** — `test_config_env_var_override` sets `IK_AUTH__INBOUND_KEY` via
`monkeypatch.setenv`, then calls `_load_config(settings_files=["settings.json"])` and asserts
the result is `"overridden-key"`. With `UPPER_SNAKE_CASE` keys throughout (both JSON and
Pydantic model fields), Dynaconf's double-underscore env var separator (`IK_AUTH__INBOUND_KEY`
→ `AUTH.INBOUND_KEY`) maps directly to the model field without any normalisation step. The
assertion is falsifiable.

The developer must verify all three tests pass by running:

```bash
pnpm --filter processing pytest tests/shared/test_config.py -v
```

(or from `services/processing/` directly: `python3 -m pytest tests/shared/test_config.py -v`)

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — Class name deviates from task specification for the base LLM config model**

File: `services/processing/shared/config.py`, line 7

The task specification names the base LLM config class `BaseLLMConfig`. The implementation
uses `LLMBaseConfig`. The practical impact is zero — downstream modules access config values
as attributes on the `AppConfig` instance (e.g. `config.PROCESSING.LLM.MODEL`) and never
need to import the model class directly. This is a suggestion only, not blocking.

---

**S-002 — Sub-config class names carry a `Query` prefix not in the task spec**

File: `services/processing/shared/config.py`, lines 69–73

The task spec names these `VectorSearchConfig` and `ContextAssemblyConfig`. The
implementation uses `QueryVectorSearchConfig` and `QueryContextAssemblyConfig`. The prefix
avoids naming collisions with any future pipeline-side equivalents, which may be intentional.
As with S-001, downstream code accesses these only through `AppConfig` instances, so the
impact is zero. Document the intent briefly in an inline comment if it is deliberate.

---

## Summary

**Outcome**: Pass

Both blocking findings from the first review round (B-001 — flat `AppConfig` structure; B-002 —
camelCase key mismatch) have been fully resolved:

- `AppConfig` now correctly nests the five processing sub-configs under `ProcessingConfig`,
  matching the task specification exactly.
- `settings.json`, `settings.test.json`, and all Pydantic model field names use
  `UPPER_SNAKE_CASE` throughout, eliminating the key normalisation problem entirely and
  making the env var override path straightforward.
- All three suggestions from the first review (S-001 module docstring, S-002 untyped dict,
  S-003 duplicate test) have been applied.

No blocking findings remain. Task status set to `review_passed`.

The review is ready for the user to check.
