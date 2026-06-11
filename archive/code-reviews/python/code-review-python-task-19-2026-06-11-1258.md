# Code Review — Python Service — Task 19: Query handler (`query/query_handler.py`)

**Date**: 2026-06-11 12:58
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/query/query_handler.py`
- `services/processing/tests/query/test_query_handler.py`
- `services/processing/tests/fakes/query_router.py`
- `services/processing/tests/fakes/llm_service.py` (additions only — `FullFakeLLMService` and module-level defaults)
- `services/processing/tests/fakes/http_client.py` (additions only — `FakeVectorSearchHttpClient`)
- `services/processing/shared/config.py` (S-002 fix — `TOP_K` constraint)

## Acceptance condition

The task's acceptance condition is:

> Unit tests in `tests/query/test_query_handler.py` confirm using mocked dependencies:
> (1) the full pipeline runs in correct sequence (router → understanding → embedding →
> vector search → assembly → synthesis) and returns a `SynthesisResult`;
> (2) when vector search returns an empty list, `SynthesisResult.no_results = True`;
> (3) `_graph_search()` raises `NotImplementedError`. Three test functions.

**Condition type**: automated

**Result**: Met

All three acceptance conditions are verified by three test functions:

- `test_full_pipeline_returns_synthesis_result` — AC-1: asserts `isinstance(result,
  SynthesisResult)`, `result.no_results is False`, `result.response_text != ""`,
  correct embedding and `top_k` sent to vector search (confirmed via
  `fake_http.vector_search_calls`), and at least one citation with the expected
  `chunk_id`. The test exercises the complete pipeline with a real `_MOCK_RESULT`
  fixture and confirms vector search was called exactly once with the correct arguments.
  These are falsifiable assertions.

- `test_empty_vector_search_returns_no_results` — AC-2: asserts `result.no_results is
  True`, `result.citations == []`, and that vector search was called (confirming the
  pipeline still reached step 4 before the early-return in synthesis).

- `test_graph_search_raises_not_implemented` — AC-3: asserts `NotImplementedError` via
  `pytest.raises`.

All three tests carry `@pytest.mark.ci_integration` (Tier 2 — correct, they wire fakes
at the handler boundary) and run without `@pytest.mark.asyncio` (consistent with
`asyncio_mode = auto`). All three tests passed in the review run.

## Findings

### Blocking

None.

### Suggestions

**S-001 — `query_handler.py` lines 78–79: `route_decision` is captured but never
consulted**

The `route_decision.strategy` value is logged but the handler always continues through
all six steps regardless of the routing decision returned. In Phase 1 this is correct
because `PassthroughQueryRouter` always returns `strategy="vector"`. However, a future
developer reading this code may not notice that the routing decision has no effect on
the execution path. A brief inline comment at the point where the handler proceeds to
step 2 would clarify the Phase 1 intent:

```python
route_decision = self._query_router.route(query_text)
log.info("query_routing_completed", strategy=route_decision.strategy)
# Phase 1: always vector — PassthroughQueryRouter guarantees strategy="vector".
# Phase 2 will branch here for graph and hybrid routes.
```

This is a readability suggestion only; the code is correct as written.

**S-002 — `tests/fakes/llm_service.py` lines 22–43, 47–66, 71–95: factory functions
define inner classes**

`create_mock_llm_service`, `create_mock_llm_service_for_query`,
`create_mock_llm_service_for_synthesis`, and `create_error_llm_service` each define a
concrete `LLMService` subclass inside the function body. These are not new for this
task (they pre-date Task 19), but the addition of `FullFakeLLMService` as a top-level
named class highlights the contrast. The inner-class pattern prevents these fakes from
being reused across test files without re-instantiating the factory. Consider converting
them to top-level classes in a future consolidation pass. Not in scope for this task.

## Summary

**Outcome**: Pass

All three acceptance conditions are met with falsifiable, correctly tiered (Tier 2)
tests. The implementation complies with ADR-042 (module boundary — all imports from
`query/` or `shared/`, none from `pipeline/`). Config narrowing is applied correctly
— `QueryHandler` accepts `QueryVectorSearchConfig` and `QueryContextAssemblyConfig`,
not `AppConfig`. The type transformation in `_map_search_results` correctly converts
the `Result` Pydantic model (generated) to the `SearchResult` dataclass (internal),
including the `documentType` empty-string normalisation. Structured logging is
consistent with the project standard. `ruff check`, `ruff format --check`, `mypy .`,
and `pytest -m "not integration" tests/` (98 tests) all pass with zero errors.

Task status set to `review_passed`.

The review is ready for the user to check.
