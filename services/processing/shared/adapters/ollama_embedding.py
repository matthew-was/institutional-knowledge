"""
OllamaEmbeddingAdapter — Phase 1 embedding implementation using the Ollama HTTP API

ADR-024, ADR-042.
"""

import httpx
import structlog

from shared.config import EmbeddingConfig
from shared.interfaces.embedding_service import EmbeddingResult, EmbeddingService


class OllamaEmbeddingAdapter(EmbeddingService):
    def __init__(self, config: EmbeddingConfig, log: structlog.BoundLogger) -> None:
        self._model = config.MODEL
        self._expected_dimension = config.DIMENSION
        self._log = log.bind(service="ollama_embedding")
        self._client = httpx.AsyncClient(base_url=config.BASE_URL)

    async def close(self) -> None:
        await self._client.aclose()

    async def embed(self, text: str) -> EmbeddingResult:
        try:
            # Ollama /api/embeddings API (v0.1.x): "prompt" is the input key
            payload = {
                "prompt": text,
                "model": self._model,
                "stream": False,
            }
            response = await self._client.post("/api/embeddings", json=payload)
            response.raise_for_status()
            embedding_data = response.json().get("embedding")

            if embedding_data is None:
                raise ValueError(
                    "ollama embeddings response was None: embedding_data=None"
                )
            if len(embedding_data) == 0:
                raise ValueError(
                    "ollama embeddings response was empty: embedding_data=0"
                )

            actual_dimension = len(embedding_data)

            if actual_dimension != self._expected_dimension:
                raise ValueError(
                    f"ollama embedding dimension mismatch: "
                    f"expected {self._expected_dimension}, got {actual_dimension}"
                )

            return EmbeddingResult(
                embedding=embedding_data,
                dimension=actual_dimension,
                model=self._model,
            )

        except httpx.TransportError as tra_err:
            self._log.error(
                "error in request to ollama embedding", error=type(tra_err).__name__
            )
            raise

        except httpx.HTTPStatusError as stat_err:
            self._log.error(
                "error returned from ollama embedding", error=type(stat_err).__name__
            )
            raise
