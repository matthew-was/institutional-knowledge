"""Tests for the embedding generation pipeline step (Task 15)."""

import pytest
import structlog

from pipeline.steps.embedding_generation import run_embedding_generation
from shared.interfaces.embedding_service import EmbeddingResult
from shared.interfaces.llm_service import (
    ChunkResult,
    LLMCombinedResult,
)
from tests.fakes.embedding_service import (
    create_error_embedding_service,
    create_mock_embedding_service,
)

_DIMENSION = 3


def make_llm_result(chunks: list[ChunkResult]) -> LLMCombinedResult:
    return LLMCombinedResult(
        chunks=chunks,
        metadata_fields={},
        entities=[],
        relationships=[],
    )


def make_chunk(
    index: int, text: str = "some text", token_count: int = 10
) -> ChunkResult:
    return ChunkResult(text=text, chunk_index=index, token_count=token_count)


def make_embedding(dimension: int = _DIMENSION) -> EmbeddingResult:
    return EmbeddingResult(
        embedding=[0.1] * dimension,
        dimension=dimension,
        model="test-model",
    )


@pytest.mark.ci_integration
async def test_all_chunks_produce_embeddings_returns_completed() -> None:
    """All chunks produce embeddings — step returns completed with matching count."""
    chunks = [make_chunk(0), make_chunk(1), make_chunk(2)]
    llm_result = make_llm_result(chunks)
    service = create_mock_embedding_service(make_embedding(_DIMENSION))

    result = await run_embedding_generation(
        llm_result=llm_result,
        embedding_service=service,
        embedding_dimension=_DIMENSION,
        log=structlog.get_logger(),
    )

    assert result.step_status == "completed"
    assert result.error_message is None
    assert len(result.embeddings) == len(chunks)
    assert result.embeddings[0].chunk_index == 0
    assert result.embeddings[1].chunk_index == 1
    assert result.embeddings[2].chunk_index == 2


@pytest.mark.ci_integration
async def test_dimension_mismatch_returns_failed_with_no_partial_results() -> None:
    """A dimension mismatch on any chunk causes failed with zero partial results."""
    chunks = [make_chunk(0), make_chunk(1)]
    llm_result = make_llm_result(chunks)
    # The service returns dimension 5 but we expect _DIMENSION (3)
    mismatched = EmbeddingResult(embedding=[0.1] * 5, dimension=5, model="test-model")
    service = create_mock_embedding_service(mismatched)

    result = await run_embedding_generation(
        llm_result=llm_result,
        embedding_service=service,
        embedding_dimension=_DIMENSION,
        log=structlog.get_logger(),
    )

    assert result.step_status == "failed"
    assert result.error_message is not None
    assert "dimension mismatch" in result.error_message
    assert len(result.embeddings) == 0


@pytest.mark.ci_integration
async def test_provider_exception_returns_failed_with_no_partial_results() -> None:
    """A provider exception on any chunk causes failed with zero partial results."""
    chunks = [make_chunk(0), make_chunk(1)]
    llm_result = make_llm_result(chunks)
    service = create_error_embedding_service(RuntimeError("provider unavailable"))

    result = await run_embedding_generation(
        llm_result=llm_result,
        embedding_service=service,
        embedding_dimension=_DIMENSION,
        log=structlog.get_logger(),
    )

    assert result.step_status == "failed"
    assert result.error_message is not None
    assert len(result.embeddings) == 0
