# Code Review — Python Service — Task 2: Config loading (`shared/config.py`)

**Date**: 2026-03-31 11:25
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/config.py`
- `services/processing/tests/shared/test_config.py`
- `services/processing/settings.json` (referenced by tests)
- `services/processing/tests/shared/settings.test.json` (test fixture)

---

## Acceptance condition

The task requires a pytest unit test in `tests/shared/test_config.py` confirming:

1. Valid `settings.json` produces a populated `AppConfig` instance with correct types.
2. A missing required field (`auth.inboundKey`) causes a Pydantic `ValidationError` at load time.
3. A `DYNACONF_AUTH__INBOUND_KEY` environment variable overrides the file value.

**Condition type**: automated

**Result**: Partially met — see Blocking finding B-002 below.

Assertions (1) and (2) are met:

- (1) `test_singleton_config_spot_check` and `test_config_spot_check` confirm a populated
  `AppConfig` is produced from `settings.json`. Pydantic's construction-time validation
  means type correctness is implicit in the fact that the model constructs without error.
  The spot-check on `inboundKey` is a reasonable proxy, though it only exercises one field.
- (2) `test_config_missing_attribute` uses a fixture JSON (`settings.test.json`) that omits
  `auth.inboundKey` and asserts `pydantic.ValidationError` is raised. The fixture has been
  inspected and the field is absent. This is a falsifiable, correctly targeted test.

Assertion (3) is at risk — see Blocking finding B-002.

---

## Findings

### Blocking

**B-001 — `AppConfig` structure diverges from the task specification**

File: `services/processing/shared/config.py`, lines 96–104

The task description explicitly specifies:

> `AppConfig` — `processing`, `query`, `auth`, `service`

The fields `ocr`, `llm`, `embedding`, `metadata`, and `pipeline` must be nested under a
`ProcessingConfig` sub-model, not placed directly at the top level of `AppConfig`. The
implementation flattens them:

```python
class AppConfig(BaseModel):
    ocr: OCRConfig          # should be inside ProcessingConfig
    llm: LLMConfig          # should be inside ProcessingConfig
    embedding: EmbeddingConfig  # should be inside ProcessingConfig
    metadata: MetadataConfig    # should be inside ProcessingConfig
    pipeline: PipelineConfig    # should be inside ProcessingConfig
    query: QueryConfig
    auth: AuthConfig
    service: ServiceConfig
```

Every downstream module that accesses config according to the plan (e.g.
`config.processing.ocr.provider`) will get an `AttributeError`. Because all 20+ remaining
tasks import from `shared.config import config`, the shape of `AppConfig` is a load-bearing
contract. This must be corrected before any downstream task is implemented.

The `settings.json` structure also needs to be consistent with whichever shape is chosen.
Currently `settings.json` uses flat top-level keys (`ocr`, `llm`, etc.), which matches the
flat implementation but not the task spec. If `AppConfig` is restructured to use
`processing: ProcessingConfig`, `settings.json` must nest those keys under a `"processing"`
object.

What must change: introduce `ProcessingConfig` wrapping `ocr`, `llm`, `embedding`,
`metadata`, `pipeline`; update `AppConfig` to `processing: ProcessingConfig, query:
QueryConfig, auth: AuthConfig, service: ServiceConfig`; update `settings.json` and
`tests/shared/settings.test.json` accordingly; update the spot-check assertions in the tests.

---

**B-002 — Env var override mechanism may silently fail for camelCase fields**

File: `services/processing/shared/config.py`, lines 107–116
File: `services/processing/tests/shared/test_config.py`, line 20–23

The test uses `IK_AUTH__INBOUNDKEY` to override `auth.inboundKey`. With Dynaconf's
`envvar_prefix="IK"`, env var `IK_AUTH__INBOUNDKEY` is parsed as the nested key
`auth.inboundkey` (all-lowercase suffix after `__` splitting). The existing JSON value is
stored at the key `inboundKey` (camelCase, as written in `settings.json`).

Whether this override actually works depends on how Dynaconf merges the env var value with
the JSON-sourced value. If Dynaconf stores keys case-insensitively internally and produces a
merged dict where the env var's lowercase key `inboundkey` coexists alongside the JSON's
`inboundKey`, Pydantic v2 (case-sensitive by default) will read the JSON value and ignore
the env var value. The override would then silently fail, and the test would be vacuous —
asserting `"overridden-key"` while actually reading `"dev-python-service-key"` would make
the test fail, revealing the bug. But if Dynaconf normalises all keys to lowercase, the
JSON-sourced value would also be at `inboundkey`, and Pydantic would fail to match it to
the `inboundKey` field — meaning the entire config load would fail, which contradicts test
(1) passing.

The concern is: the `_lowercase_top_keys` function only lowercases the **top-level** keys of
`dynaconf_settings.as_dict()`. The nested sub-dicts retain whatever case Dynaconf produces.
If Dynaconf internally uppercases all keys (the default Dynaconf behaviour), then after
`_lowercase_top_keys` the dict passed to Pydantic looks like:

```python
{
    "auth": {"INBOUNDKEY": "...", "EXPRESSKEY": "..."},
    ...
}
```

Pydantic cannot match `INBOUNDKEY` to the field `inboundKey`. This would mean the existing
tests `test_singleton_config_spot_check` and `test_config_spot_check` should both be
failing — yet they are asserted as passing. The reviewer cannot confirm this is working
without running the tests.

What must change: verify by running `pytest tests/shared/test_config.py -v` from
`services/processing/` and confirming all four tests pass. If they do not all pass, the
key normalisation logic in `_load_config` must be extended to recursively lowercase all
nested dict keys (not just top-level), and the env var variable name used in the test must
be confirmed against Dynaconf's actual env var resolution behaviour.

If the tests do pass, document in an inline comment on `_lowercase_top_keys` how Dynaconf
produces camelCase keys for JSON-sourced values (the current behaviour is surprising enough
to warrant explanation).

---

### Suggestions

**S-001 — Missing module docstring**

File: `services/processing/shared/config.py`, line 1

The Python principles require a one-line module docstring citing the relevant ADR in every
source file where one exists. ADR-015 and ADR-016 both govern this file directly. A
docstring is absent.

Suggested addition at line 1:

```python
"""Dynaconf + Pydantic config singleton (ADR-015, ADR-016)."""
```

---

**S-002 — `_lowercase_top_keys` inner function lacks type annotations on generics**

File: `services/processing/shared/config.py`, lines 113–114

```python
def _lowercase_top_keys(d: dict) -> dict:
```

`dict` without type parameters is equivalent to `dict[Any, Any]`, which the Python
principles prohibit without justification. The function signature should use typed
parameters:

```python
def _lowercase_top_keys(d: dict[str, object]) -> dict[str, object]:
```

(or a TypeVar if the return type needs to preserve the value type).

---

**S-003 — Two overlapping tests for condition (1)**

File: `services/processing/tests/shared/test_config.py`, lines 9–14

`test_singleton_config_spot_check` and `test_config_spot_check` both assert
`inboundKey == "dev-python-service-key"`, the only difference being that one tests the
module-level singleton and the other calls `_load_config()` directly. The singleton test is
the more important one (it tests the actual import path used by all consumers). The
`_load_config` test is redundant given the missing-attribute and env-var tests already call
`_load_config` directly. Consider removing `test_config_spot_check` and using the freed
slot for a more substantive assertion on the singleton (e.g. checking a nested numeric field
like `config.ocr.qualityThreshold` to confirm deep parsing works).

---

## Summary

**Outcome**: Fail

Two blocking findings prevent this task from advancing:

- **B-001**: `AppConfig` structure does not match the task specification — the five
  processing-related sub-configs must be nested under `ProcessingConfig`, not placed at the
  top level of `AppConfig`. `settings.json` must be updated to match.
- **B-002**: The key normalisation logic (`_lowercase_top_keys`) only lowercases top-level
  keys. Whether nested camelCase keys from JSON survive through Dynaconf and Pydantic
  correctly is unclear from reading the code alone. The tests must be run and confirmed
  passing; if they are not, the normalisation must be extended recursively.

The review is ready for the user to check.
