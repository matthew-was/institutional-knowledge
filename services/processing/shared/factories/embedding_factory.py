"""Factory for creating the EmbeddingService adapter (ADR-024, ADR-042)."""

import structlog

from shared.adapters.ollama_embedding import OllamaEmbeddingAdapter
from shared.config import EmbeddingConfig
from shared.interfaces.embedding_service import EmbeddingService


def create_embedding_service(
    config: EmbeddingConfig, log: structlog.BoundLogger
) -> EmbeddingService:
    if config.PROVIDER == "ollama":
        return OllamaEmbeddingAdapter(config=config, log=log)

    raise ValueError(f"{config.PROVIDER} is not a supported Embedding Service Provider")
