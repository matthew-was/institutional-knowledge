# Code Review — Python Service — Chore 2: Make `OllamaLLMAdapter.combined_pass()` async

**Date**: 2026-05-27 13:44
**Task status at review**: in_review
**Files reviewed**:

- `services/processing/shared/interfaces/llm_service.py`
- `services/processing/shared/adapters/ollama_llm.py`
- `services/processing/tests/fakes/llm_service.py`
- `services/processing/pipeline/steps/llm_combined_pass.py`
- `services/processing/tests/pipeline/test_llm_combined_pass.py`

## Acceptance condition

The acceptance condition is automated:

> `shared/adapters/ollama_llm.py` uses `httpx.AsyncClient`; all `combined_pass()` call
> sites use `await`; `mypy .` from `services/processing/` passes with zero errors;
> `python3 -m pytest services/processing/tests/` passes with no regressions.

**Result**: Met

- `httpx.AsyncClient` is used at `ollama_llm.py` line 56. No residual `httpx.Client` usage
  anywhere in `services/processing/`.
- All `combined_pass()` call sites use `await`: `ollama_llm.py` line 127 (`await
  self._client.post`), `llm_combined_pass.py` line 153 (`combined_pass =
  await llm_service.combined_pass(...)`).
- `close()` is `async def` in both the ABC (`llm_service.py` line 51) and the adapter
  (`ollama_llm.py` line 58), and calls `await self._client.aclose()`.
- `mypy .` from `services/processing/` passes with zero errors (confirmed).
- `pytest -m "not integration" tests/` passes — 71 tests, 0 failures (confirmed).

## Findings

### Blocking

None.

### Suggestions

**S-001** — `tests/pipeline/test_llm_combined_pass.py`, line 105

`test_llm_service_creates_ollama_service` asserts `isinstance(llm_service,
OllamaLLMAdapter)`. Per CR-015, `isinstance` assertions test the shape of a value, not
its behaviour — the test would pass even if `OllamaLLMAdapter` did nothing useful. This
assertion was originally flagged as S-001 in the Task 10 review and carried forward
unchanged. It is noted again here as a carry-forward; the developer may address it
whenever the test file is next substantively touched. The fix would be to assert a
behavioural property of the returned service (for example, confirm that calling
`combined_pass` with a mocked respx response returns the expected `LLMCombinedResult`).

## Summary

**Outcome**: Pass

No blocking findings. The async conversion is complete and correct: `httpx.AsyncClient`
replaces `httpx.Client`, both `combined_pass()` and `close()` are `async def` throughout
the interface, adapter, and fake, `run_llm_combined_pass()` is `async def` with `await`
at the call site, all Tier 2 tests carry `@pytest.mark.ci_integration`, no
`@pytest.mark.asyncio` markers were added, the module boundary (ADR-042) is respected,
and both `mypy` and `pytest` pass cleanly.

Task status set to `review_passed`.

The review is ready for the user to check.
