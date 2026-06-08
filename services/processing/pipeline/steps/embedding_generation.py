"""Embedding generation pipeline step — Step 6 of the C2 pipeline (ADR-024)."""

from dataclasses import dataclass
from typing import Literal

import structlog

from shared.interfaces.embedding_service import EmbeddingResult, EmbeddingService
from shared.interfaces.llm_service import LLMCombinedResult


@dataclass
class ChunkEmbedding:
    chunk_index: int
    text: str
    token_count: int
    embedding: list[float]


@dataclass
class EmbeddingGenerationResult:
    embeddings: list[ChunkEmbedding]
    step_status: Literal["completed", "failed"]
    error_message: str | None


def embedding_generation_result_builder(
    step_status: Literal["completed", "failed"],
    error_message: str | None,
    embeddings: list[ChunkEmbedding] | None,
) -> EmbeddingGenerationResult:
    return EmbeddingGenerationResult(
        embeddings=embeddings if embeddings is not None else [],
        step_status=step_status,
        error_message=error_message,
    )


async def run_embedding_generation(
    llm_result: LLMCombinedResult,
    embedding_service: EmbeddingService,
    embedding_dimension: int,
    log: structlog.BoundLogger,
) -> EmbeddingGenerationResult:
    collected: list[ChunkEmbedding] = []

    for chunk in llm_result.chunks:
        try:
            result: EmbeddingResult = await embedding_service.embed(chunk.text)
        except Exception as exc:
            log.error(
                "embedding provider raised an exception",
                chunk_index=chunk.chunk_index,
                exception_type=type(exc).__name__,
                exception_message=str(exc),
            )
            return embedding_generation_result_builder(
                step_status="failed",
                error_message="embedding provider exception",
                embeddings=None,
            )

        if result.dimension != embedding_dimension:
            log.error(
                "embedding dimension mismatch",
                chunk_index=chunk.chunk_index,
                expected_dimension=embedding_dimension,
                actual_dimension=result.dimension,
            )
            return embedding_generation_result_builder(
                step_status="failed",
                error_message=(
                    f"dimension mismatch on chunk {chunk.chunk_index}: "
                    f"expected {embedding_dimension}, got {result.dimension}"
                ),
                embeddings=None,
            )

        collected.append(
            ChunkEmbedding(
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                token_count=chunk.token_count,
                embedding=result.embedding,
            )
        )

    log.debug(
        "embedding generation successful",
        chunk_count=len(collected),
    )

    return embedding_generation_result_builder(
        step_status="completed",
        error_message=None,
        embeddings=collected,
    )
