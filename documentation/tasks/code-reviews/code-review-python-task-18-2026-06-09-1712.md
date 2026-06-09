# Code Review — Python Service — Task 18: Pipeline Orchestrator

**Date**: 2026-06-09 17:12
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/orchestrator.py`
- `services/processing/tests/pipeline/test_orchestrator.py`
- `services/processing/tests/fakes/http_client.py`
- `services/processing/tests/fakes/quality_scorer.py`
- `services/processing/tests/fakes/metadata_extractor.py`
- `services/processing/tests/fakes/completeness_scorer.py`
- `documentation/tasks/python-tasks.md` (task spec update)

---

## Acceptance condition

**Restated**: Unit tests in `tests/pipeline/test_orchestrator.py` confirm using mocked step
implementations: (1) when `incomplete_steps` does not include `text_extraction`, step 1 is
skipped and `previous_outputs` text is used for step 2; (2) an extraction failure flag from
step 1 halts the pipeline and steps 2–6 do not run; (3) when both text quality (step 2) and
completeness (step 4) thresholds fail, the `ProcessingResponse` contains exactly one flag
with both reasons; (4) when neither threshold fails, steps 1–6 all run and the response
includes non-None `chunks` and `entities`. Four test functions.

**Condition type**: automated

**Result**: Met

- AC-1: `test_reentrancy_skips_extraction_and_uses_previous_outputs` — constructs a request
  with `text_extraction` absent from `incomplete_steps`, confirms `STEP_TEXT_EXTRACTION not in
  response.step_results`, and asserts `STEP_TEXT_QUALITY_SCORING` ran and Express was called.
  The test is falsifiable: if the orchestrator ignored `incomplete_steps` and ran step 1
  unconditionally, `STEP_TEXT_EXTRACTION in response.step_results` would be true and the
  assertion would fail.

- AC-2: `test_flag_from_step_1_halts_pipeline` — passes an `OCRResult` with zero pages,
  which causes `run_ocr_extraction` to produce an `extraction_failure` flag. The test confirms
  steps 2–6 are absent from `step_results`, metadata/chunks/entities are None, and Express
  was called once. Falsifiable: removing the flag gate would allow downstream steps to run,
  making the absence assertions fail.

- AC-3: `test_combined_flag_when_both_quality_and_completeness_fail` — injects
  `FailingQualityScorer` and `FailingCompletenessScorer`. Asserts exactly one flag with type
  `quality_and_completeness_failure`, and that both `"quality threshold"` and
  `"completeness score"` appear as substrings in the merged reason. The string checks are
  falsifiable: the quality flag reason is `"Pages [...] below quality threshold"` and the
  completeness flag reason is `"Metadata completeness score 0.0 below threshold; ..."` — both
  substrings are present in the concatenated result, but would be absent if either scorer were
  swapped for a passing one.

- AC-4: `test_full_pipeline_returns_non_none_chunks_and_entities` — passes both scorers as
  `Passing*`, provides a full `LLMCombinedResult` with one chunk and one entity. Asserts all
  six step names are in `step_results`, `response.flags` is empty, chunks and entities are
  non-None and non-empty, and Express was called. Guarded with `pytest.fail()` before field
  access on possibly-None values. Falsifiable throughout.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Applied suggestions from previous review round (verified)

**S-001 — Pre-declared `llm_pass_result` variable** (`orchestrator.py` line 268):
`llm_pass_result: LLMCombinedPassResult | None = None` is declared before the conditional
block. No `type: ignore[assignment]` present. Correctly applied.

**S-002 — Abstract base class types in `make_orchestrator`**
(`test_orchestrator.py` lines 85–86): `quality_scorer: TextQualityScorer | None = None` and
`completeness_scorer: MetadataCompletenessScorer | None = None` use the abstract interfaces,
not the concrete fakes. The `http_client` parameter retains `FakeHttpClient` so that tests
can inspect `post_processing_results_calls` — this is correct and expected.

**S-003 — Strengthened combined-flag assertion** (`test_orchestrator.py` lines 225–227):
Both `"quality threshold"` and `"completeness score"` are asserted as substrings of the
merged reason. The reason strings from the respective scorers confirm both substrings will be
present when both fail, and absent when either passes.

---

## Quality checks

**Type annotations**: All functions and methods are fully annotated. No `Any` without
justification. No non-null assertions.

**Internal types as dataclasses**: `StepResult`, `PreviousOutputs`, `ProcessingRequest`,
`ProcessingResponse` are all `@dataclass`. No Pydantic `BaseModel` for internal types.

**Module boundary (ADR-042)**: `orchestrator.py` imports only from `pipeline.*` and
`shared.*`. No cross-boundary coupling.

**Infrastructure as Configuration**: All services injected at construction; no hardcoded
provider names, URLs, or credentials.

**HTTP client pattern**: `_post_results` calls `self._http_client.post_processing_results()`
through the `HttpClientBase` interface. No direct Express calls.

**Logging**: `structlog` used throughout. No document content logged — only `document_id`,
`flag_count`, `step_count`, `failing_pages` (step metadata, not document text).

**Test tier compliance**: All four tests carry `@pytest.mark.ci_integration` (Tier 2). No
`@pytest.mark.asyncio` markers (redundant under `asyncio_mode = auto`). Fake implementations
live in `tests/fakes/` modules, not defined inline.

**Fake placement**: `FakeHttpClient` in `tests/fakes/http_client.py`;
`PassingQualityScorer`/`FailingQualityScorer` in `tests/fakes/quality_scorer.py`;
`MinimalMetadataExtractor` in `tests/fakes/metadata_extractor.py`;
`PassingCompletenessScorer`/`FailingCompletenessScorer` in `tests/fakes/completeness_scorer.py`.
All correctly placed.

**Flag gate correctness**: The gate checks `len(extraction.document_flags) > 0` (line 154).
For the `FileOpenError` path in `run_ocr_extraction`, the step status is `"failed"` and
`document_flags` is `[]` — so that path does NOT trigger the halt, which allows
`_post_results` to be called with a `"failed"` step result but no flags. This matches the
updated task spec: only step 1 flags (not a failed step status) halt the pipeline.

**Plan compliance**: The implementation matches the plan. The description overwrite precedence
(OQ-5) is implemented at lines 314–333. The combined-flag rule (US-039/UR-055) is implemented
at lines 252–263. Re-entrancy (ADR-027) is handled for all six steps. The single POST to
Express after pipeline completion is implemented via `_post_results`. The generated model
conversion in `_post_results` uses `ApiProcessingResultsPostRequest` from `shared/generated/`
with camelCase field names, satisfying the snake_case to camelCase serialisation requirement.

---

## Summary

**Outcome**: Pass

No blocking findings. All three applied suggestions from the previous review round are
correctly implemented. All four acceptance conditions are met by falsifiable tests. The
implementation satisfies the clarified task specification, the project's quality standards,
and the Python development principles.

Task status set to `review_passed`.

The review is ready for the user to check.
