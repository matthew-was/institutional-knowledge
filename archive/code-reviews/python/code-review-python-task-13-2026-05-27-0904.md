# Code Review — Python Service — Task 13: `QueryRouter` interface and `PassthroughQueryRouter` (C3)

**Date**: 2026-05-27 09:04
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/query/interfaces/query_router.py`
- `services/processing/query/implementations/passthrough_router.py`
- `services/processing/query/router_factory.py`
- `services/processing/tests/query/test_query_router.py`

Supporting files consulted:

- `services/processing/shared/config.py` (QueryConfig, ROUTER field)
- `services/processing/settings.json` (QUERY.ROUTER key)
- `services/processing/tests/query/__init__.py` (presence confirmed)

---

## Acceptance condition

**Condition**: Unit test in `tests/query/test_query_router.py` confirms: (1) the pass-through
router always returns `strategy = "vector"` regardless of the input query text; (2)
`extracted_entities` is always an empty list; (3) `reasoning` is always `None`; (4)
`create_query_router()` returns `PassthroughQueryRouter` when config sets
`query.router = "passthrough"`. Four test functions, each covering one assertion.

**Condition type**: automated

**Result**: Met

The test file contains exactly four test functions:

1. `test_passthrough_router_strategy_is_always_vector` — calls `router.route()` with three
   distinct inputs (a entity-style query, a relationship-style query, and an empty string)
   and asserts `strategy == "vector"` for each. Falsifiable: the implementation returns a
   hardcoded strategy value, and a change to any other value would fail all three assertions.

2. `test_passthrough_router_extracted_entities_is_always_empty` — asserts
   `result.extracted_entities == []`. Falsifiable: if the implementation populated the list,
   this assertion fails.

3. `test_passthrough_router_reasoning_is_always_none` — asserts `result.reasoning is None`.
   Falsifiable: if the implementation set a reasoning string, this assertion fails.

4. `test_create_query_router_returns_passthrough_for_passthrough_config` — calls
   `create_query_router()` with a config where `ROUTER="passthrough"` and asserts
   `isinstance(router, PassthroughQueryRouter)` followed by a functional assertion on
   `decision.strategy`. The `isinstance` check is falsifiable: a wrong or missing
   implementation class would fail it.

All four assertions are falsifiable. The acceptance condition is fully met.

---

## Findings

### Blocking

None.

### Suggestions

**S-001** — `services/processing/tests/query/test_query_router.py`, line 77

`assert isinstance(decision, RouteDecision)` immediately before `assert decision.strategy == "vector"` is redundant. The `isinstance` check on the decision type adds no regression protection that the `strategy` assertion on the next line does not already provide: if `route()` returned something other than a `RouteDecision`, the `.strategy` access would raise `AttributeError` and the test would fail anyway. Consider removing line 77 to keep the test assertions lean. This also avoids a pattern that CR-015 flags as one to watch (type-shape assertions).

---

## Summary

**Outcome**: Pass

The implementation is clean and correct. No blocking findings.

- ADR-042 boundary compliance: confirmed — no `pipeline/` imports anywhere in `query/` or its
  tests. All imports are within `query/` or from `shared/`.
- Config narrowing: `create_query_router(config: QueryConfig)` accepts the sub-config, not
  `AppConfig`. Correct.
- `settings.json` contains `QUERY.ROUTER: "passthrough"` in `UPPER_SNAKE_CASE`. Correct.
- All three files carry ADR-citation module docstrings (`ADR-040, ADR-042`). Correct.
- `__init__.py` present in `query/interfaces/`, `query/implementations/`, and
  `tests/query/`. Correct.
- `RouteDecision` uses `field(default_factory=list)` for `extracted_entities`. No mutable
  default argument issue.
- Tests are unmarked Tier 1 (no `@pytest.mark.ci_integration`). Correct — these are pure
  unit tests with no I/O or service construction.
- No `@pytest.mark.asyncio` used. All tests are synchronous. Correct.
- Local `_make_query_config()` helper used instead of a conftest fixture. Correct.

Task status set to `review_passed`.

The review is ready for the user to check.
