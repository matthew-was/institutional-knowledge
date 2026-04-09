# Code Review — Python Service — Task 8: `PatternMetadataExtractor` interface and `RegexPatternExtractor` (Step 3)

**Date**: 2026-04-09 10:29
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/interfaces/metadata_extractor.py`
- `services/processing/pipeline/adapters/regex_pattern_extractor.py`
- `services/processing/pipeline/factories/metadata_factory.py`
- `services/processing/shared/config.py`
- `services/processing/settings.json`
- `services/processing/tests/pipeline/test_pattern_metadata.py`

---

## Acceptance condition

**Condition type**: automated

Three conditions:

1. A known text string containing a date pattern returns a non-empty `dates` list when the
   matching pattern is configured.
2. A text string with no matching patterns returns all list fields empty, both `str | None`
   fields `None`, and all confidence values `0.0`.
3. A malformed regex pattern in config causes `RegexPatternExtractor` to raise `re.error`
   (the orchestrator handles step status).

**Result**: Met

**Condition 1** — `test_date_pattern_match` (line 47) configures a single date pattern, runs `extract`
against `test_text`, and asserts `len(result.dates) == 1` and `result.dates[0] == "22/03/1923"`.
The assertion would fail if the pattern extractor returned an empty list or a different value.

**Condition 2** — `test_no_matches` (line 71) constructs an extractor with no patterns for any
field and asserts that every list field is empty, both `str | None` fields are `None`, and all
six confidence values are `0.0`. Comprehensive and falsifiable.

**Condition 3** — `test_malformed_regex` (line 88) passes `"["` as a pattern string and asserts
`pytest.raises(re.PatternError)`. `re.PatternError` is an alias for `re.error` in Python 3.12+
(confirmed: `re.PatternError is re.error` evaluates `True`), so the assertion exactly matches
the task spec.

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — Tests marked `@pytest.mark.ci_integration` when they qualify as Tier 1 unit tests**

File: `services/processing/tests/pipeline/test_pattern_metadata.py`, all 12 tests

All twelve tests construct `RegexPatternExtractor` directly with an inline config object.
No external I/O occurs (no HTTP, no filesystem, no DB); the structlog logger passed via
`structlog.get_logger()` is the real logger but produces no side-effects that affect
correctness. The logic under test is pure: compile patterns in `__init__`, apply them in
`extract`.

The task spec says "Unit tests in `tests/pipeline/test_pattern_metadata.py`" and the
precedent established by Task 7 (`test_text_quality_scoring.py`) uses unmarked Tier 1 tests
for the same construction pattern (`WeightedTextQualityScorer` constructed with inline config,
no external dependencies, no marker).

The `@pytest.mark.ci_integration` marker is not incorrect (Tier 2 tests also run in CI), but
it is inconsistent with the spec and with Task 7. If any future CI gate is introduced that
runs only unmarked tests in a fast path, these tests would be excluded from it despite
qualifying as instant pure-function tests.

Suggested fix: remove `@pytest.mark.ci_integration` from all twelve tests (keeping them as
plain unmarked Tier 1 tests), consistent with `test_text_quality_scoring.py`.

---

**S-002 — `test_date_pattern_no_match` name is slightly ambiguous**

File: `services/processing/tests/pipeline/test_pattern_metadata.py`, line 59

`test_date_pattern_no_match` tests that the text `test_text_no_match` does not contain a
date in slash format (`\d{1,2}/\d{1,2}/\d{2,4}`). The name "no match" could be read as
"no pattern configured" (which is what `test_no_matches` covers) rather than "pattern
configured but text does not match." A name like `test_date_pattern_no_match_in_text` or
`test_date_pattern_text_without_matching_date` would distinguish it clearly from
`test_no_matches`.

This is cosmetic — the test itself is correct and falsifiable.

---

## Summary

**Outcome**: Pass

No blocking findings. Task 8 status set to `review_passed`.

The review is ready for the user to check.
