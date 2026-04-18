# Code Review — Python Service — Task 11: LLM combined pass step — chunk post-processing

**Date**: 2026-04-18 13:22
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/pipeline/steps/llm_combined_pass.py` (new)
- `services/processing/tests/pipeline/test_llm_combined_pass.py` (lines 133–401 appended)
- `services/processing/tests/fakes/llm_service.py` (new)

---

## Acceptance condition

The task states: Unit tests in `tests/pipeline/test_llm_combined_pass.py` confirm:
(1) a chunk below `CHUNKING_MIN_TOKENS` is merged with the next chunk to form one chunk;
(2) a chunk above `CHUNKING_MAX_TOKENS` is split into two or more chunks;
(3) after post-processing all chunks are assigned sequential 0-based `chunk_index` values;
(4) `entities` and `relationships` are unchanged by post-processing.
Tests use inline min/max values — no live LLM required.

**Condition type**: automated

**Result**: Met (subject to the blocking finding below being resolved)

The four acceptance conditions are covered as follows:

- (1) `test_two_chunks_below_min_tokens` — two 2-char and 3-char chunks (both below MIN of
  10) are merged into one, asserted with `len(result.result.chunks) == 1` and
  `result.result.chunks[0].text == "AA BBB"`.
- (2) `test_split_chunk_above_max_tokens` — one 150-char chunk (above MAX of 100) is split
  into two, asserted with `len(result.result.chunks) == 2` and length checks on each part.
- (3) `chunk_index` re-sequencing is asserted explicitly in every new test (`chunks[0].chunk_index == 0`, `chunks[1].chunk_index == 1`).
- (4) `result.result.entities == llm_combined_pass_merge_response.entities` and
  `result.result.metadata_fields == llm_combined_pass_merge_response.metadata_fields` are
  checked in `test_two_chunks_below_min_tokens` and `test_split_chunk_above_max_tokens`.

The implementation chose Option A (Tier 2 tests through `run_llm_combined_pass`). All new
test functions carry `@pytest.mark.ci_integration`, which is correct for this tier. The
`tests/fakes/llm_service.py` fake is placed at the correct location per the fakes placement
rule.

The failure path (`step_status = "failed"` when the LLM call returns `None`) is covered by
`test_none_result_from_service_returns_empty_result`, consistent with the task description
requirement.

The acceptance condition assertions are falsifiable: removing `merge_chunks` would cause
(1) to produce two chunks instead of one; removing `split_chunks` would cause (2) to produce
one chunk instead of two; removing the re-indexing loop would leave all `chunk_index` values
at `0` rather than the expected sequential values.

**Manual verification**: none required (automated condition only).

---

## Findings

### Blocking

**B-001 — Return type mismatch in `tests/fakes/llm_service.py`**

File: `services/processing/tests/fakes/llm_service.py`, line 8

The `combined_pass` method override declares its return type as `-> LLMCombinedResult`:

```python
def combined_pass(
    self, text: str, document_type: str | None
) -> LLMCombinedResult:
    return mocked_result
```

`mocked_result` has type `LLMCombinedResult | None` (the parameter type of
`create_mock_llm_service`). When the fake is constructed with `None` (as in
`test_none_result_from_service_returns_empty_result`), `combined_pass` returns `None`
while its declared return type is `LLMCombinedResult`. `mypy` will flag this as a type
error — a function typed `-> LLMCombinedResult` cannot return `None`.

The abstract base class in `shared/interfaces/llm_service.py` declares the correct return
type `-> LLMCombinedResult | None`. The override must use the same signature (or a subtype
that still permits `None`). The return annotation must be changed to `-> LLMCombinedResult | None`
to match the ABC and to satisfy `mypy`.

---

### Suggestions

**S-001 — Misleading inline comment on line 139 of the test file**

File: `services/processing/tests/pipeline/test_llm_combined_pass.py`, line 139

The comment reads `# 150 chars — exceeds MAX of 100` but the chunk text is `"AA"` (two
characters). This appears to be a copy-paste from the adjacent test. The comment should
reflect the actual value (e.g. `# 2 chars — below MIN of 10`).

---

**S-002 — `merge_chunks` mutates caller-owned `ChunkResult` objects in-place**

File: `services/processing/pipeline/steps/llm_combined_pass.py`, line 111

```python
working_chunks[-1].text += " " + chunks[i].text
```

This modifies the `.text` attribute on a `ChunkResult` object that was appended by reference
from the caller's `chunks` list. Because `ChunkResult` is not a frozen dataclass, the
mutation succeeds silently and modifies the same object that exists in the caller's
`LLMCombinedResult.chunks`. In the current test suite each test constructs fresh data so
this does not manifest, but it is a side effect that future callers would not expect from a
function named `merge_chunks`. Consider constructing a new `ChunkResult` on the merge path
(as is done in `split_chunks`), or documenting that the function mutates its input.

---

**S-003 — Inconsistent boundary comparison between `split_chunks` and its inner paragraph check**

File: `services/processing/pipeline/steps/llm_combined_pass.py`, lines 53 and 62

The outer chunk entry check uses `<= config.CHUNKING_MAX_TOKENS` (line 53, passes through
chunks at or below the limit), but the paragraph-already-fits check uses
`< config.CHUNKING_MAX_TOKENS` (line 62, triggers sentence-splitting even for a paragraph
that is exactly at the limit). A paragraph at exactly `CHUNKING_MAX_TOKENS` characters
would be passed to sentence-splitting unnecessarily. Using `<=` at line 62 (consistent with
line 53) would make the boundary uniform.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the return type annotation on `MockedLLMService.combined_pass`
in `tests/fakes/llm_service.py` declares `-> LLMCombinedResult` while the implementation
may return `None` (when constructed with `create_mock_llm_service(None)`). This mismatches
the ABC signature and is a `mypy` type error under the project's type annotation standard.

Task status set to `review_failed`.

The review is ready for the user to check.
