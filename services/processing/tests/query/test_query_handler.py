"""Tests for QueryHandler — C3 query pipeline orchestrator (Task 19)."""

from uuid import UUID

import pytest
import structlog

from query.interfaces.query_router import RouteDecision
from query.query_handler import QueryHandler
from query.response_synthesis import SynthesisResult
from shared.config import QueryContextAssemblyConfig, QueryVectorSearchConfig
from shared.generated.models import Document1, Result
from shared.interfaces.embedding_service import EmbeddingResult
from shared.interfaces.llm_service import (
    QueryUnderstandingResult,
    SynthesisLLMResult,
)
from tests.fakes.embedding_service import MockEmbeddingService
from tests.fakes.http_client import FakeVectorSearchHttpClient
from tests.fakes.llm_service import FullFakeLLMService
from tests.fakes.query_router import FakeQueryRouter

_CHUNK_UUID = UUID("00000000-0000-0000-0000-000000000001")
_DOC_UUID = UUID("00000000-0000-0000-0000-000000000002")

_EMBEDDING = [0.1, 0.2, 0.3]

_MOCK_RESULT = Result(
    chunkId=_CHUNK_UUID,
    documentId=_DOC_UUID,
    text="Transfer of East Meadow to John Smith.",
    chunkIndex=0,
    tokenCount=12,
    similarityScore=0.95,
    document=Document1(
        description="Transfer of East Meadow",
        date="1967-03-15",
        documentType="deed",
    ),
)


def make_vector_search_config(top_k: int = 5) -> QueryVectorSearchConfig:
    return QueryVectorSearchConfig(TOP_K=top_k)


def make_context_assembly_config(
    token_budget: int = 4000,
    include_parent_metadata: bool = False,
) -> QueryContextAssemblyConfig:
    return QueryContextAssemblyConfig(
        TOKEN_BUDGET=token_budget,
        INCLUDE_PARENT_METADATA=include_parent_metadata,
    )


def make_understanding_result(
    query_text: str = "test query",
) -> QueryUnderstandingResult:
    return QueryUnderstandingResult(
        intent="find_content",
        refined_search_terms=query_text,
        extracted_entities=[],
        routing_hint="vector",
        confidence=0.9,
    )


def make_handler(
    search_results: list[Result] | None = None,
    understanding_result: QueryUnderstandingResult | None = None,
    synthesis_result: SynthesisLLMResult | None = None,
    top_k: int = 5,
) -> tuple[QueryHandler, FakeVectorSearchHttpClient]:
    """Construct a QueryHandler wired with fakes for Tier 2 tests."""
    embedding_result = EmbeddingResult(
        embedding=_EMBEDDING,
        dimension=3,
        model="test-model",
    )
    fake_llm = FullFakeLLMService(
        understanding_result=understanding_result,
        synthesis_result=synthesis_result,
    )
    fake_embedding = MockEmbeddingService(mocked_result=embedding_result)
    fake_http = FakeVectorSearchHttpClient(search_results=search_results or [])
    log = structlog.get_logger().bind(service="test")

    handler = QueryHandler(
        query_router=FakeQueryRouter(
            RouteDecision(strategy="vector", extracted_entities=[], reasoning=None)
        ),
        llm_service=fake_llm,
        embedding_service=fake_embedding,
        http_client=fake_http,
        vector_search_config=make_vector_search_config(top_k=top_k),
        context_assembly_config=make_context_assembly_config(),
        log=log,
    )
    return handler, fake_http


@pytest.mark.ci_integration
async def test_full_pipeline_returns_synthesis_result() -> None:
    """AC-1: Full pipeline runs in correct sequence and returns a SynthesisResult."""
    handler, fake_http = make_handler(search_results=[_MOCK_RESULT], top_k=5)

    result = await handler.handle("what happened to East Meadow")

    assert isinstance(result, SynthesisResult)
    assert result.no_results is False
    assert result.response_text != ""
    # Verify vector_search was called with the embedding and correct top_k
    assert len(fake_http.vector_search_calls) == 1
    embedding_sent, top_k_sent = fake_http.vector_search_calls[0]
    assert embedding_sent == _EMBEDDING
    assert top_k_sent == 5
    # At least one citation should be present (text contains [Citation 1])
    assert len(result.citations) >= 1
    assert result.citations[0].chunk_id == str(_CHUNK_UUID)


@pytest.mark.ci_integration
async def test_empty_vector_search_returns_no_results() -> None:
    """AC-2: Empty vector search results → SynthesisResult.no_results = True."""
    handler, fake_http = make_handler(search_results=[])

    result = await handler.handle("show me all deeds")

    assert isinstance(result, SynthesisResult)
    assert result.no_results is True
    assert result.citations == []
    assert len(fake_http.vector_search_calls) == 1


@pytest.mark.ci_integration
async def test_graph_search_raises_not_implemented() -> None:
    """AC-3: _graph_search() raises NotImplementedError (Phase 2 stub)."""
    handler, _ = make_handler()

    with pytest.raises(NotImplementedError):
        handler._graph_search()
