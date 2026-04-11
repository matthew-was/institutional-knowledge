# Code Review — Python Service — Task 9: `MetadataCompletenessScorer` interface and `WeightedFieldPresenceScorer`

**Date**: 2026-04-11 13:28
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/interfaces/completeness_scorer.py`
- `services/processing/pipeline/steps/completeness_scoring.py`
- `services/processing/tests/pipeline/test_completeness_scoring.py`

## Acceptance condition

**Condition type**: automated

Unit tests in `tests/pipeline/test_completeness_scoring.py` confirm: (1) a `MetadataResult`
with all fields populated scores 100; (2) a `MetadataResult` with no fields populated scores
0; (3) a `MetadataResult` with a subset of fields detected scores proportionally to the
configured weights; (4) a score at or above the threshold returns `passed_threshold = True`
and a score below returns `passed_threshold = False`. Tests use inline weight values — no
dependency on OQ-4 decisions.

**Result**: Met

All four required tests are present and use `pytest.approx` for float comparisons:

- `test_all_fields_populated` — asserts `score == pytest.approx(100.0)`, `passed_threshold is True`,
  correct `detected_fields` and empty `missing_fields`. Would fail if scoring returned anything
  other than 100.0.
- `test_no_fields_populated` — asserts `score == pytest.approx(0.0)`, `passed_threshold is False`,
  empty `detected_fields`, full `missing_fields`. Would fail if any field were incorrectly
  detected.
- `test_populated_fields_above_threshold` — uses four of six fields; asserts `score == pytest.approx(65.0)`
  and `passed_threshold is True`. Arithmetic verified: `(0.2 + 0.15 + 0.15 + 0.15) / 1.0 * 100 = 65.0`.
- `test_populated_fields_below_threshold` — uses two of six fields; asserts
  `score == pytest.approx(35.0)` and `passed_threshold is False`. Arithmetic verified:
  `(0.2 + 0.15) / 1.0 * 100 = 35.0`.

All tests use inline weights (not `settings.json`) via a `make_weighted_field_presence_scorer()`
factory helper that constructs `MetadataConfig` directly. No dependency on OQ-4 decisions.

All assertions are falsifiable. No `@pytest.mark.ci_integration` markers are present — correct
for Tier 1 tests.

## Findings

### Blocking

None.

### Suggestions

**S-001** — `completeness_scoring.py` line 1: the module docstring does not cite an ADR.
The ADR Citation Standard (`development-principles-python.md`) requires a docstring citing
the relevant ADR where one exists. ADR-012 governs pattern-based metadata extraction (the
same ADR cited in `completeness_scorer.py` and `metadata_extractor.py`). The docstring
could read: `"""WeightedFieldPresenceScorer — Phase 1 metadata completeness scoring
(ADR-012)."""`. Not blocking — the docstring is present; the ADR citation is missing.

**S-002** — `tests/pipeline/test_completeness_scoring.py` line 140: the inline arithmetic
comment reads `# Total (0.2 + 0.15) * 100 = 0.35`. The final figure `0.35` is the
pre-multiplication weight sum, not the score. It should read `= 35.0` to match the assertion
on the next line. The assertion itself is correct; this is a comment-only inaccuracy.

**S-003** — `tests/pipeline/test_completeness_scoring.py` lines 38–46: the module-level
constant `ALL_FIELDS_POPULATED` is defined but never referenced anywhere in the test file.
Consider removing it to avoid reader confusion about whether it is intentional dead code
or a test helper that was left behind.

## Summary

**Outcome**: Pass

No blocking findings. The implementation satisfies the task spec and all four acceptance
conditions. Explicit presence checks (`is not None and value != ""` for scalar fields;
`len(value) > 0` for list fields) comply with the implicit-truthiness prohibition. No code
is shared with `WeightedTextQualityScorer`. No `@pytest.mark.ci_integration` markers appear
on the Tier 1 tests. Module boundary (ADR-042) is not crossed. Three cosmetic suggestions
are noted above; applying them is optional.

Task status set to `review_passed`.

The review is ready for the user to check.
