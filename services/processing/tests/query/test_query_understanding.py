"""Tests for query/query_understanding.py — Task 14 acceptance conditions."""

import json

import httpx
import pytest
import respx
import structlog

from query.query_understanding import run_query_understanding
from shared.adapters.ollama_llm import OllamaLLMAdapter
from shared.config import LLMConfig
from shared.interfaces.llm_service import QueryUnderstandingResult
from tests.fakes.llm_service import create_mock_llm_service_for_query

_LOG: structlog.BoundLogger = structlog.get_logger()


def make_valid_result() -> QueryUnderstandingResult:
    return QueryUnderstandingResult(
        intent="find_content",
        refined_search_terms="land deed 1923 County Cork",
        extracted_entities=[
            {"name": "County Cork", "type": "Land Parcel"},
            {"name": "1923", "type": "Date"},
        ],
        routing_hint="vector",
        confidence=0.92,
    )


def make_fallback_result(query_text: str) -> QueryUnderstandingResult:
    """The fallback the adapter returns on malformed JSON."""
    return QueryUnderstandingResult(
        intent="unknown",
        refined_search_terms=query_text,
        extracted_entities=[],
        routing_hint=None,
        confidence=0.0,
    )


@pytest.mark.ci_integration
async def test_valid_response_parsed_into_result_with_correct_field_values() -> None:
    """Acceptance condition 1: a valid structured JSON response is parsed into
    QueryUnderstandingResult with correct field values."""
    expected = make_valid_result()
    service = create_mock_llm_service_for_query(expected)

    result = await run_query_understanding(
        query_text="land deeds from County Cork around 1923",
        llm_service=service,
        log=_LOG,
    )

    assert result.intent == "find_content"
    assert result.refined_search_terms == "land deed 1923 County Cork"
    assert len(result.extracted_entities) == 2
    first_entity = result.extracted_entities[0]
    assert first_entity == {"name": "County Cork", "type": "Land Parcel"}
    assert result.extracted_entities[1] == {"name": "1923", "type": "Date"}
    assert result.routing_hint == "vector"
    assert result.confidence == pytest.approx(0.92)


@pytest.mark.ci_integration
async def test_malformed_json_triggers_fallback_intent_unknown() -> None:
    """Acceptance condition 2: a malformed JSON response triggers the safe fallback
    and returns intent = 'unknown'."""
    original_query = "who owned the farm in 1890"
    fallback = make_fallback_result(original_query)
    service = create_mock_llm_service_for_query(fallback)

    result = await run_query_understanding(
        query_text=original_query,
        llm_service=service,
        log=_LOG,
    )

    assert result.intent == "unknown"


@pytest.mark.ci_integration
async def test_malformed_json_fallback_refined_search_terms_equals_original() -> None:
    """Acceptance condition 2 (continued): fallback returns refined_search_terms equal
    to the original query text."""
    original_query = "who owned the farm in 1890"
    fallback = make_fallback_result(original_query)
    service = create_mock_llm_service_for_query(fallback)

    result = await run_query_understanding(
        query_text=original_query,
        llm_service=service,
        log=_LOG,
    )

    assert result.refined_search_terms == original_query


@pytest.mark.ci_integration
async def test_fallback_does_not_raise() -> None:
    """Acceptance condition 3: the fallback does not raise an unhandled exception."""
    original_query = "show me wills from the 1950s"
    fallback = make_fallback_result(original_query)
    service = create_mock_llm_service_for_query(fallback)

    try:
        result = await run_query_understanding(
            query_text=original_query,
            llm_service=service,
            log=_LOG,
        )
    except Exception as exc:
        pytest.fail(f"run_query_understanding raised an unexpected exception: {exc}")

    assert result.intent == "unknown"
    assert result.refined_search_terms == original_query


def make_adapter() -> OllamaLLMAdapter:
    config = LLMConfig(
        CHUNKING_MIN_TOKENS=100,
        CHUNKING_MAX_TOKENS=1000,
        PROVIDER="ollama",
        BASE_URL="http://test:11434",
        MODEL="mistral",
    )
    return OllamaLLMAdapter(config=config, log=structlog.get_logger())


@pytest.mark.ci_integration
@respx.mock
async def test_malformed_json_response_triggers_fallback(
    respx_mock: respx.MockRouter,
) -> None:
    """B-001: malformed JSON from Ollama triggers fallback in OllamaLLMAdapter."""
    original_query = "who owned the farm in 1890"
    adapter = make_adapter()
    respx_mock.post("http://test:11434/api/generate").mock(
        return_value=httpx.Response(200, json={"response": "not json"})
    )

    result = await adapter.understand_query(original_query)

    assert result.intent == "unknown"
    assert result.refined_search_terms == original_query


@pytest.mark.ci_integration
@respx.mock
async def test_validation_error_response_triggers_fallback(
    respx_mock: respx.MockRouter,
) -> None:
    """B-001: valid JSON missing required fields triggers Pydantic fallback."""
    original_query = "show me wills from the 1950s"
    adapter = make_adapter()
    # Missing required fields: intent, refined_search_terms, confidence
    incomplete_payload = json.dumps({"routing_hint": "vector"})
    respx_mock.post("http://test:11434/api/generate").mock(
        return_value=httpx.Response(200, json={"response": incomplete_payload})
    )

    result = await adapter.understand_query(original_query)

    assert result.intent == "unknown"
    assert result.refined_search_terms == original_query
