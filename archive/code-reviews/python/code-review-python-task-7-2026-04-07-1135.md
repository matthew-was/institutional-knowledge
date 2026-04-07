# Code Review — Python Service — Task 7: `TextQualityScorer` interface and implementation (Step 2)

**Date**: 2026-04-07 11:35
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/interfaces/text_quality_scorer.py`
- `services/processing/pipeline/steps/text_quality_scoring.py`
- `services/processing/tests/pipeline/test_text_quality_scoring.py`
- `services/processing/shared/config.py`
- `services/processing/settings.json`

---

## Acceptance condition

The task acceptance condition is **automated**:

Unit tests in `tests/pipeline/test_text_quality_scoring.py` confirm:

1. A document where all pages score above the threshold returns `passed_threshold = True`
   and empty `failing_pages`.
2. A document where one page is below the threshold returns `passed_threshold = False`
   and `failing_pages = [<page_number>]`.
3. All pages are scored regardless of any individual failure (no early exit).
4. The document score is the arithmetic mean of per-page scores.

Tests use hardcoded input values — no mock needed (pure function).

**Result**: Met

- Condition 1: `test_all_pages_pass_threshold` — three pages with confidence 1.0 and full
  density above a threshold of 50; asserts `passed_threshold is True` and `failing_pages == []`.
  Falsifiable: removing the scorer logic would fail construction of `QualityResult` without
  the correct fields.
- Condition 2: `test_single_page_below_threshold` — page 2 has low confidence (0.1) and low
  density (10/100 = 10%) giving a score of 10, well below the threshold of 50; asserts
  `failing_pages == [2]`. Falsifiable: if failing pages were not tracked, the assertion would
  fail.
- Condition 3: `test_all_pages_scored_no_early_exit` — pages 2 and 3 both fail; the assertion
  `failing_pages == [2, 3]` confirms page 3 was scored after page 2 failed, because an early
  exit after page 2's failure would produce `failing_pages == [2]` only.
- Condition 4: `test_document_score_is_arithmetic_mean` — manually computes the expected
  document score from the formula and asserts `result.document_score == pytest.approx(...)`.
  Falsifiable: an incorrect mean calculation would produce a different value.

All four tests are Tier 1 unit tests (pure function, no I/O, no service construction) and are
not marked with `@pytest.mark.ci_integration` — correct for Tier 1.

---

## Findings

### Blocking

**B-001 — Missing `Field(gt=0)` constraint on `TARGET_CHARS_PER_PAGE`**

File: `services/processing/shared/config.py`, line 18

The task spec explicitly requires:

```python
TARGET_CHARS_PER_PAGE: Annotated[int, Field(gt=0)]
```

The implementation has:

```python
TARGET_CHARS_PER_PAGE: int
```

This is a required constraint, not a suggestion. A value of `0` would cause a
`ZeroDivisionError` at runtime in `WeightedTextQualityScorer.score()` (line 30:
`len(page) / self._target_chars_per_page`). The Config Field Constraints principle in
`development-principles-python.md` states: "When a numeric config field has a minimum value
required for correct runtime behaviour (not just sensible operation), enforce it with a
Pydantic field constraint." Division by zero qualifies — the constraint must be added.

**What must change**: add `Annotated[int, Field(gt=0)]` to the `TARGET_CHARS_PER_PAGE`
field in `OCRQualityScoringConfig`.

---

### Suggestions

**S-001 — Fifth test (`test_early_exit`) uses a misleading name**

File: `services/processing/tests/pipeline/test_text_quality_scoring.py`, line 104

The test is named `test_early_exit` but it tests the empty-input guard path (zero pages),
not the no-fail-fast behaviour. The no-early-exit acceptance condition (condition 3) is
covered by `test_all_pages_scored_no_early_exit`. The name `test_early_exit` implies it is
testing the early-exit guard from condition 3, which could mislead a future reader into
thinking the wrong test covers that condition. A name such as `test_empty_input_returns_zero_score`
or `test_zero_pages_returns_failed` would be clearer.

This test is not in the four required by the acceptance condition — it is a reasonable
extra guard. The finding is about naming only, not correctness.

---

## Summary

**Outcome**: Fail

One blocking finding: `TARGET_CHARS_PER_PAGE` in `OCRQualityScoringConfig` is missing the
`Field(gt=0)` constraint required by the task spec and by the Config Field Constraints
principle. A value of `0` would produce a `ZeroDivisionError` at runtime.

Task status set to `review_failed`.

The review is ready for the user to check.
