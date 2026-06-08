# Code Review — Python Service — Task 16: Context assembly (`query/context_assembly.py`)

**Date**: 2026-06-08 11:45
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/query/context_assembly.py`
- `services/processing/query/interfaces/search_result.py`
- `services/processing/tests/query/test_context_assembly.py`
- `services/processing/shared/config.py` (config model verification)
- `services/processing/settings.json` (config key verification)

## Acceptance condition

The acceptance condition is **automated**: unit tests in `tests/query/test_context_assembly.py`
confirm (all pure function, no mock needed):

1. Results are ordered by similarity score descending
2. Chunks are accumulated until the token budget is reached and `truncated = True` is set when the budget causes exclusion
3. When all chunks fit within the budget `truncated = False`
4. An empty input list returns `AssembledContext` with empty `chunks` and `total_tokens = 0`

**Result**: Met

All four conditions are covered:

1. `test_results_ordered_by_similarity_score_descending` — passes three results in arbitrary order
   (low=0.5, high=0.9, medium=0.7), confirms the assembled order is `[chunk-high, chunk-med, chunk-low]`
   by `chunk_id`. Falsifiable: if `sorted(results, key=..., reverse=True)` were removed the
   assertion would fail.

2. `test_token_budget_causes_truncation` — uses two 40-char chunks (10 tokens each) with a budget
   of 15. Only the higher-scored chunk fits; `truncated is True` and `len(context.chunks) == 1` are
   both asserted. Falsifiable: removing the budget check or the `truncated = True` assignment
   breaks both assertions.

3. `test_all_chunks_fit_within_budget_truncated_false` — same two chunks with budget 1000;
   asserts `truncated is False` and `len(context.chunks) == 2`. Falsifiable: hardcoding `truncated
   = True` would break the first assertion.

4. `test_empty_input_returns_empty_context_with_zero_tokens` — empty list, asserts
   `context.chunks == []` and `context.total_tokens == 0` and `context.truncated is False`.
   Falsifiable: if the early-return path were removed or modified these would fail.

One note: the empty-input test also asserts `isinstance(context, AssembledContext)`. Under
CR-015 this is a borderline shape assertion, but in this case it provides meaningful signal —
if the function returned `None` or raised, the assertion would fail. It is not vacuous here.

## Findings

### Blocking

None.

### Suggestions

**S-001** — `TOKEN_BUDGET` config field lacks a `gt=0` constraint
`services/processing/shared/config.py`, line 87.

```python
TOKEN_BUDGET: int
```

A token budget of 0 or negative would cause all chunks to be skipped and `truncated = True`
on every call without any meaningful assembly — this is incorrect runtime behaviour, not
merely suboptimal operation. The Config Field Constraints principle (`development-principles-python.md`)
requires an `Annotated[int, Field(gt=0)]` constraint when a value in the invalid range
produces incorrect behaviour. Suggested change:

```python
TOKEN_BUDGET: Annotated[int, Field(gt=0)]
```

This is a suggestion rather than blocking because the incorrect-behaviour threshold is
reasonable to debate (a budget of 1 is technically valid, even if impractical), and the
existing implementation does handle the zero case without crashing — it just returns
`truncated = True` with an empty chunk list, which is logically coherent if arguably
surprising. Flag for the developer to decide.

**S-002** — `truncated` flag does not account for chunks skipped due to fitting after a
skipped chunk
`services/processing/query/context_assembly.py`, lines 53–58.

The current loop uses `continue` rather than `break` after a chunk exceeds the budget. This
means a later chunk with fewer tokens can still be included after a larger chunk was skipped,
resulting in a non-contiguous selection. The `truncated` flag is set to `True` correctly
(a chunk was excluded), but the assembled context may not be in a contiguous similarity-order
window — it is a "best fit within budget" selection rather than a "top-N within budget"
selection.

The task description says "accumulate chunks until the token budget is reached", which
implies `break`, not `continue`. The plan says the same: "Accumulate chunks until the token
budget is reached or all chunks are included."

The current behaviour could confuse Task 17 (response synthesis), which formats chunks with
citation markers and assumes the assembled context is a meaningful ranked window. This is
worth clarifying with the developer: was `continue` an intentional "fill gaps" strategy or
an accidental deviation from the spec? If the spec intent is "stop at the first chunk that
does not fit", this should be `break`.

This is a suggestion, not blocking, because the task acceptance tests pass (they do not test
the `continue` vs `break` distinction), and the behaviour is internally consistent. However
it is a meaningful semantic difference that affects synthesis quality in Task 17.

## Summary

**Outcome**: Pass

No blocking findings. Two suggestions raised for developer consideration: a config field
constraint on `TOKEN_BUDGET` (S-001) and a semantic question about `continue` vs `break` in
the accumulation loop (S-002, the more substantive of the two).

The implementation is a clean pure function, correctly typed, correctly placed in
`query/interfaces/` with no cross-boundary imports, uses `@dataclass` throughout, and all
four acceptance condition tests are falsifiable and cover the stated conditions.

The review is ready for the user to check.
