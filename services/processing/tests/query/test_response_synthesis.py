"""Tier 2 tests for response synthesis step — Task 17."""

import httpx
import pytest
import respx
import structlog

from query.context_assembly import AssembledContext
from query.interfaces.search_result import DocumentMetadata, SearchResult
from query.response_synthesis import (
    SynthesisResult,
    synthesize_response,
)
from shared.adapters.ollama_llm import OllamaLLMAdapter
from shared.config import config
from shared.interfaces.llm_service import SynthesisLLMResult
from tests.fakes.llm_service import (
    create_error_llm_service,
    create_mock_llm_service_for_synthesis,
)


def _make_log() -> structlog.BoundLogger:
    return structlog.get_logger().bind(test="response_synthesis")


def _make_doc(
    description: str = "A deed",
    date: str = "1945-01-01",
    document_type: str | None = "deed",
) -> DocumentMetadata:
    return DocumentMetadata(
        description=description,
        date=date,
        document_type=document_type,
    )


def _make_search_result(
    chunk_id: str,
    document_id: str,
    text: str,
    document: DocumentMetadata | None = None,
) -> SearchResult:
    doc = document if document is not None else _make_doc()
    return SearchResult(
        chunk_id=chunk_id,
        document_id=document_id,
        text=text,
        chunk_index=0,
        token_count=len(text) // 4,
        similarity_score=0.9,
        document=doc,
    )


def _make_assembled_context(chunks: list[SearchResult]) -> AssembledContext:
    return AssembledContext(
        chunks=chunks,
        total_tokens=sum(len(c.text) // 4 for c in chunks),
        truncated=False,
        include_parent_metadata=True,
    )


@pytest.mark.ci_integration
async def test_citation_markers_map_to_correct_source_chunks() -> None:
    """Acceptance condition 1: citation markers in the LLM response map to the correct
    source chunks by chunk_id and document_id."""
    chunk_a = _make_search_result(
        chunk_id="chunk-a",
        document_id="doc-001",
        text="The property at Lot 5, Section A was conveyed.",
        document=_make_doc(
            description="Deed 1945", date="1945-06-01", document_type="deed"
        ),
    )
    chunk_b = _make_search_result(
        chunk_id="chunk-b",
        document_id="doc-002",
        text="I hereby bequeath my lands to my eldest son.",
        document=_make_doc(
            description="Will 1920", date="1920-03-15", document_type="will"
        ),
    )
    assembled = _make_assembled_context([chunk_a, chunk_b])

    # LLM response references both citation markers
    llm_response = (
        "Based on the archive, [Citation 1] shows the Lot 5 transfer. "
        "Additionally, [Citation 2] provides the bequest clause."
    )
    fake_llm = create_mock_llm_service_for_synthesis(
        SynthesisLLMResult(response_text=llm_response)
    )

    result = await synthesize_response(
        assembled_context=assembled,
        query_text="What happened to Lot 5?",
        llm_service=fake_llm,
        log=_make_log(),
    )

    if not isinstance(result, SynthesisResult):
        pytest.fail("synthesize_response did not return a SynthesisResult")

    assert result.response_text == llm_response
    assert result.no_results is False
    assert len(result.citations) == 2

    citation_1 = result.citations[0]
    assert citation_1.chunk_id == "chunk-a"
    assert citation_1.document_id == "doc-001"
    assert citation_1.document_description == "Deed 1945"
    assert citation_1.document_date == "1945-06-01"

    citation_2 = result.citations[1]
    assert citation_2.chunk_id == "chunk-b"
    assert citation_2.document_id == "doc-002"
    assert citation_2.document_description == "Will 1920"
    assert citation_2.document_date == "1920-03-15"


@pytest.mark.ci_integration
async def test_no_citation_markers_in_response_returns_empty_citations() -> None:
    """Acceptance condition 2: when the LLM response contains no [Citation N] markers,
    the citations list is empty."""
    chunk = _make_search_result(
        chunk_id="chunk-x",
        document_id="doc-003",
        text="Some relevant archive text.",
    )
    assembled = _make_assembled_context([chunk])

    # LLM response with no citation markers
    llm_response = "The archive contains information about land parcels in this region."
    fake_llm = create_mock_llm_service_for_synthesis(
        SynthesisLLMResult(response_text=llm_response)
    )

    result = await synthesize_response(
        assembled_context=assembled,
        query_text="Tell me about land parcels.",
        llm_service=fake_llm,
        log=_make_log(),
    )

    if not isinstance(result, SynthesisResult):
        pytest.fail("synthesize_response did not return a SynthesisResult")

    assert result.citations == []
    assert result.no_results is False
    assert result.response_text == llm_response


@pytest.mark.ci_integration
async def test_empty_assembled_context_returns_no_results_without_llm_call() -> None:
    """Acceptance condition 3: when the assembled context is empty, no_results=True
    and response_text explicitly states no relevant documents were found (UR-099).
    The LLM is NOT called — the fake would raise if called."""
    assembled = AssembledContext(
        chunks=[],
        total_tokens=0,
        truncated=False,
        include_parent_metadata=False,
    )

    # Use error fake that raises if any method is called
    error_llm = create_error_llm_service()

    result = await synthesize_response(
        assembled_context=assembled,
        query_text="Is there anything about the farm?",
        llm_service=error_llm,
        log=_make_log(),
    )

    if not isinstance(result, SynthesisResult):
        pytest.fail("synthesize_response did not return a SynthesisResult")

    assert result.no_results is True
    assert "No relevant documents" in result.response_text
    assert result.citations == []


# Adapter-level tests for OllamaLLMAdapter.synthesize()


def _make_synthesis_adapter() -> OllamaLLMAdapter:
    """Create an OllamaLLMAdapter configured with test settings."""
    from shared.config import LLMConfig

    synthesis_config = config.QUERY.SYNTHESIS.LLM
    llm_config = LLMConfig(
        CHUNKING_MIN_TOKENS=config.PROCESSING.LLM.CHUNKING_MIN_TOKENS,
        CHUNKING_MAX_TOKENS=config.PROCESSING.LLM.CHUNKING_MAX_TOKENS,
        PROVIDER=synthesis_config.PROVIDER,
        BASE_URL=synthesis_config.BASE_URL,
        MODEL=synthesis_config.MODEL,
    )
    return OllamaLLMAdapter(config=llm_config, log=_make_log())


@pytest.mark.ci_integration
@respx.mock
async def test_synthesize_valid_ollama_response(respx_mock: respx.MockRouter) -> None:
    """Adapter test: valid Ollama response parses correctly into SynthesisLLMResult."""
    adapter = _make_synthesis_adapter()
    response_text = "Based on the archive, the property transferred in 1945."
    respx_mock.post(f"{adapter._client.base_url}/api/generate").mock(
        return_value=httpx.Response(200, json={"response": response_text})
    )

    result = await adapter.synthesize("Synthesize an answer about the property.")

    assert result.response_text == response_text


@pytest.mark.ci_integration
@respx.mock
async def test_synthesize_missing_response_field_raises(
    respx_mock: respx.MockRouter,
) -> None:
    """Adapter test: Ollama response missing 'response' field raises ValidationError."""
    adapter = _make_synthesis_adapter()
    # Response body missing the 'response' field entirely
    respx_mock.post(f"{adapter._client.base_url}/api/generate").mock(
        return_value=httpx.Response(200, json={"model": "mistral"})
    )

    with pytest.raises(ValueError, match="validation error"):
        await adapter.synthesize("Synthesize an answer.")


@pytest.mark.ci_integration
@respx.mock
async def test_synthesize_http_error_propagates(respx_mock: respx.MockRouter) -> None:
    """Adapter test: HTTP errors propagate (no fallback for synthesize)."""
    adapter = _make_synthesis_adapter()
    respx_mock.post(f"{adapter._client.base_url}/api/generate").mock(
        return_value=httpx.Response(500, text="Server error")
    )

    with pytest.raises(httpx.HTTPStatusError):
        await adapter.synthesize("Synthesize an answer.")
