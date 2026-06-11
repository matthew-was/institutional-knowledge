# Code Review — Python Service — Task 19: Query handler (`query/query_handler.py`)

**Date**: 2026-06-11 12:46
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/query/query_handler.py`
- `services/processing/tests/query/test_query_handler.py`
- `services/processing/tests/fakes/query_router.py`
- `services/processing/tests/fakes/http_client.py` (modified — `FakeVectorSearchHttpClient` added)

---

## Acceptance condition

**Condition type**: automated

**Stated condition**: Unit tests in `tests/query/test_query_handler.py` confirm using
mocked dependencies: (1) the full pipeline runs in correct sequence (router → understanding
→ embedding → vector search → assembly → synthesis) and returns a `SynthesisResult`; (2)
when vector search returns an empty list, `SynthesisResult.no_results = True`; (3)
`_graph_search()` raises `NotImplementedError`. Three test functions.

**Result**: Met

- **AC-1** (`test_full_pipeline_returns_synthesis_result`): confirms `isinstance(result,
  SynthesisResult)`, `no_results is False`, `response_text != ""`, that `vector_search` was
  called once with the correct embedding and `top_k`, and that at least one citation is
  present with the expected `chunk_id`. Falsifiable on all counts.

- **AC-2** (`test_empty_vector_search_returns_no_results`): confirms `no_results is True`,
  `citations == []`, and that `vector_search` was called once. Falsifiable.

- **AC-3** (`test_graph_search_raises_not_implemented`): calls `handler._graph_search()` and
  asserts `pytest.raises(NotImplementedError)`. Falsifiable.

All three acceptance conditions are covered by exactly one test each, exactly as specified.

---

## Findings

### Blocking

None.

### Suggestions

**S-001** — `services/processing/tests/query/test_query_handler.py`, lines 78–91:
`FullFakeLLMService` is defined inline inside `make_handler()` and does not extend
`LLMService`. It is passed with `# type: ignore[arg-type]` (line 109). The
development-principles-python.md anti-patterns table states "Test helper fakes for service
ABCs defined inline in a test file — Prevents reuse across test files; put them in
`tests/fakes/<service_name>.py`". A fully typed factory that accepts both
`understanding_result` and `synthesis_result` parameters could be added to
`tests/fakes/llm_service.py` alongside the existing three factory functions, eliminating
the `type: ignore` and making the combined fake available for future query handler tests.
Not required — the caller's pre-review note acknowledged this as intentionally limited — but
bringing it into `tests/fakes/` would align with the placement rule and remove the suppressed
type error.

**S-002** — `services/processing/shared/config.py`, line 83: `QueryVectorSearchConfig.TOP_K`
has no field constraint. The config field constraints principle states that when a numeric
value has a minimum required for correct runtime behaviour, enforce it with a Pydantic
constraint. A `TOP_K` of zero would produce incorrect vector search behaviour (no results
returned regardless of the query). Consider `TOP_K: Annotated[int, Field(gt=0)]` for
consistency with other config fields that have correctness-critical minimums (e.g.
`TOKEN_BUDGET: Annotated[int, Field(gt=0)]` on the same `QueryContextAssemblyConfig`).

**S-003** — `services/processing/query/query_handler.py`, line 136: the `_map_search_results`
parameter is typed as `list` with a comment `# list[Result] from shared/generated/models.py`.
The reason given is acceptable (the `Result` type is available from `shared/generated/` and
could be imported without creating a module boundary violation — `shared/` is the approved
cross-module import layer). Using the concrete type `list[Result]` would eliminate the bare
`list` and the explanatory comment, making the signature self-documenting. Not blocking because
the existing comment makes the intent clear and the caller reviewed this pattern explicitly.

---

## Summary

**Outcome**: Pass

No blocking findings. All three acceptance conditions are met with falsifiable tests. The
implementation correctly orchestrates the C3 pipeline in six steps, uses narrowed config
injection (`QueryVectorSearchConfig`, `QueryContextAssemblyConfig`), performs the
camelCase-to-snake_case type transformation at the system edge in `_map_search_results()`,
respects the ADR-042 module boundary (no imports from `pipeline/`), and wires all
dependencies via constructor injection. The `FakeQueryRouter` and `FakeVectorSearchHttpClient`
are correctly placed in `tests/fakes/` and extend their respective ABCs. All three test
functions carry `@pytest.mark.ci_integration` as required for Tier 2.

Task status set to `review_passed`.

The review is ready for the user to check.
