# Code Review — Python Service — Task 11: LLM combined pass step — chunk post-processing

**Date**: 2026-04-18 13:46
**Task status at review**: in_review
**Round**: 2 (re-review after B-001 fix)
**Files reviewed**:

- `services/processing/pipeline/steps/llm_combined_pass.py`
- `services/processing/tests/pipeline/test_llm_combined_pass.py`
- `services/processing/tests/fakes/llm_service.py`

---

## Acceptance condition

The task states: Unit tests in `tests/pipeline/test_llm_combined_pass.py` confirm:
(1) a chunk below `CHUNKING_MIN_TOKENS` is merged with the next chunk to form one chunk;
(2) a chunk above `CHUNKING_MAX_TOKENS` is split into two or more chunks;
(3) after post-processing all chunks are assigned sequential 0-based `chunk_index` values;
(4) `entities` and `relationships` are unchanged by post-processing.
Tests use inline min/max values — no live LLM required.

**Condition type**: automated

**Result**: Met

All four acceptance conditions are satisfied. No change since round 1 — the acceptance
condition assessment carries forward unchanged.

---

## Round 1 findings — resolution check

### B-001 — Return type mismatch in `tests/fakes/llm_service.py` (resolved)

`combined_pass` in `MockedLLMService` now declares `-> LLMCombinedResult | None`
(line 8), matching the ABC signature and the type of the `mocked_result` parameter.
The `mypy` type error is resolved. **Blocking finding cleared.**

### S-001 — Misleading inline comment in test file (resolved)

The comment `# 150 chars — exceeds MAX of 100` that appeared on the `"AA"` chunk in
`test_two_chunks_below_min_tokens` has been removed. The chunk construction at lines
138–141 now carries no misleading annotation. **Suggestion applied.**

### S-002 — `merge_chunks` mutating caller-owned `ChunkResult` objects (not applied)

`merge_chunks` line 113 still performs `working_chunks[-1].text += " " + chunks[i].text`,
mutating a `ChunkResult` that was appended by reference from the caller's list. The
developer has chosen not to apply this suggestion. That is within their discretion — the
suggestion was not blocking and current tests are not affected by the side effect. No
action required.

### S-003 — Inconsistent boundary comparison in `split_chunks` (resolved)

The paragraph-fits check at line 62 now reads `len(paragraph) <= config.CHUNKING_MAX_TOKENS`,
consistent with the outer chunk entry check at line 53. A paragraph at exactly
`CHUNKING_MAX_TOKENS` characters is no longer sent unnecessarily to sentence-splitting.
**Suggestion applied.**

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

All round 1 findings are accounted for: B-001 resolved; S-001 and S-003 applied; S-002
not applied (developer's discretion, not blocking). No new findings identified.

Task status set to `review_passed`.

The review is ready for the user to check.
