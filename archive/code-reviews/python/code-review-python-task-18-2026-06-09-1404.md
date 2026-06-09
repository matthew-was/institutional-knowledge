# Code Review — Python Service — Task 18: Pipeline Orchestrator

**Date**: 2026-06-09 14:04
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/orchestrator.py`
- `services/processing/tests/pipeline/test_orchestrator.py`
- `services/processing/tests/fakes/http_client.py`
- `services/processing/tests/fakes/quality_scorer.py`
- `services/processing/tests/fakes/metadata_extractor.py`
- `services/processing/tests/fakes/completeness_scorer.py`

---

## Acceptance condition

The task's acceptance condition (type: automated) requires four test functions confirming
using mocked step implementations:

1. When `incomplete_steps` does not include `text_extraction`, step 1 is skipped and
   `previous_outputs` text is used for step 2.
2. A document flag from step 1 or 2 halts the pipeline and steps 3–6 do not run.
3. When both text quality and completeness fail, the `ProcessingResponse` contains exactly
   one flag with both reasons.
4. When neither threshold fails, steps 1–6 all run and the response includes non-None
   `chunks` and `entities`.

**Result**: Partially met — see blocking finding B-001 below.

**AC-1** (`test_reentrancy_skips_extraction_and_uses_previous_outputs`): Confirmed. The test
omits `text_extraction` from `incomplete_steps`, passes `previous_outputs` with known text,
and asserts: (a) `STEP_TEXT_EXTRACTION not in response.step_results`; (b)
`STEP_TEXT_QUALITY_SCORING in response.step_results` with status `"completed"`; (c) Express
was called once. Falsifiable — a pipeline that always ran step 1 would put
`STEP_TEXT_EXTRACTION` in `step_results`, failing assertion (a).

**AC-2** (`test_flag_from_step_1_halts_pipeline`): Partially met — see B-001.

The test covers the step 1 case: OCR returns zero pages (producing an
`extraction_failure` flag) and asserts steps 2–6 are absent from `step_results`. This is
falsifiable and correctly confirms the step 1 halt.

However, the acceptance condition states "from step **1 or 2**". There is no test for the
step 2 case. Furthermore, the implementation does not halt after step 2 quality flags —
the pipeline continues to steps 3–6 in order to apply the combined-flag rule (task
description point 5: "this is assembled after step 4 completes"). The task description
contains an internal contradiction between point 4 (halt after steps 1 or 2) and point 5
(continue to step 4 for the combined-flag rule). The implementation resolves this
contradiction in favour of point 5, which is necessary for AC-3 to be satisfiable. The
developer must decide whether the plan needs updating to reflect this resolution, and the
test coverage must be clarified accordingly — see B-001.

**AC-3** (`test_combined_flag_when_both_quality_and_completeness_fail`): Confirmed. Uses
`FailingQualityScorer` and `FailingCompletenessScorer`; asserts exactly one flag with type
`"quality_and_completeness_failure"` and that both "quality" and "completeness"/"threshold"
appear in the reason string. Falsifiable — without the merge logic, two separate flags
would be produced and `len(response.flags) == 1` would fail.

**AC-4** (`test_full_pipeline_returns_non_none_chunks_and_entities`): Confirmed. Passes a
`LLMCombinedResult` with one chunk and one entity; asserts all six steps appear in
`step_results`, `len(response.flags) == 0`, non-None `chunks` and `entities`, and
`response.entities[0].name == "John Smith"`. Uses `pytest.fail()` guards before field
access on potentially-None results (correct per principles). Falsifiable.

---

## Findings

### Blocking

**B-001 — AC-2 partially unmet: step 2 flag halt is contradicted by implementation and
not tested**

`tests/pipeline/test_orchestrator.py`, entire file

The acceptance condition AC-2 says "a document flag from step 1 **or** 2 halts the
pipeline and steps 3–6 do not run." Only the step 1 case has a test. The step 2 case is
untested and the implementation does not implement it — step 2 quality flags are recorded
and the pipeline continues to steps 3 and 4 (necessary to support AC-3's combined-flag
rule).

The task description has an internal contradiction:

- Point 4: "if steps 1 or 2 produce a `DocumentFlag`, the orchestrator halts and does not
  run steps 3–6"
- Point 5: "if both text quality and completeness thresholds fail…this is assembled after
  step 4 completes"

Satisfying both simultaneously is impossible. The implementation correctly resolves this by
not halting after step 2 quality flags. However, AC-2 is stated as written and the
"or 2" part is not satisfied. The developer must take one of the following actions before
the task can pass:

- Update the task description and acceptance condition to remove "or 2" from AC-2 (if the
  intent is that step 2 quality flags never halt the pipeline, only step 1 structural
  failures do), **or**
- Update the task description to clarify that "step 2 flags" refers only to a step
  `step_status = "failed"` technical failure (not a quality threshold flag), add a
  test for that case, and implement the halt if it is missing.

The developer should resolve this ambiguity and update the plan/task accordingly. Until
then, AC-2 is not fully met.

---

### Suggestions

**S-001 — `type: ignore[assignment]` comment could be more explicit**

`services/processing/pipeline/orchestrator.py`, line 276

```python
llm_pass_result = None  # type: ignore[assignment]  # step was previously completed
```

The `type: ignore[assignment]` is present with a comment explaining the reason, which
satisfies the project rule. However, a cleaner alternative would be to define
`llm_pass_result: LLMCombinedPassResult | None = None` before the `if` block and assign
inside the branch — eliminating the need for `type: ignore` entirely. This is a style
improvement only; the current form is not a rule violation.

**S-002 — `make_orchestrator` type hint for `quality_scorer` and `completeness_scorer`
parameters is wider than the actual usage**

`services/processing/tests/pipeline/test_orchestrator.py`, lines 83–88

```python
def make_orchestrator(
    *,
    quality_scorer: PassingQualityScorer | FailingQualityScorer | None = None,
    completeness_scorer: (
        PassingCompletenessScorer | FailingCompletenessScorer | None
    ) = None,
```

The type hints reference concrete fake classes rather than the abstract base class
interfaces (`TextQualityScorer`, `MetadataCompletenessScorer`). Using the interface types
makes the factory usable with any future fake that implements the ABC, consistent with the
project's dependency-on-abstractions principle. This is a minor readability suggestion.

**S-003 — `test_combined_flag_when_both_quality_and_completeness_fail` reason assertion
uses partial string matching**

`services/processing/tests/pipeline/test_orchestrator.py`, lines 224–226

```python
assert "quality" in merged_flag.reason.lower()
reason_lower = merged_flag.reason.lower()
assert "completeness" in reason_lower or "threshold" in reason_lower
```

The second assertion accepts either "completeness" or "threshold" appearing in the reason,
which is a weaker check than necessary. The orchestrator produces a reason that contains
both the quality flag text and the completeness flag text concatenated. Asserting both
keywords are present (e.g. `"quality_threshold_failure"` and
`"completeness_threshold_failure"` appear) would give stronger confidence that both
reasons were merged. The current form passes as long as one keyword appears; it would not
catch a case where only one reason was included. Consider strengthening to assert both
specific type strings appear.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the acceptance condition AC-2 states that step 2 flags halt
the pipeline, but the implementation does not implement this (it continues to steps 3–6
for quality flags, which is necessary for the combined-flag rule in AC-3). The task
description contains an internal contradiction between points 4 and 5. The step 2 halt
case has no test. The developer must resolve the contradiction by updating the plan and
either adding the missing test or clarifying that AC-2 only applies to step 1.

Three suggestions are noted (S-001, S-002, S-003) — none are required to pass.

Task status set to `review_failed`.

The review is ready for the user to check.
