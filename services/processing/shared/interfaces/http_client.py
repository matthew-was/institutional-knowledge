"""HttpClientBase — abstract interface for all outbound Express HTTP calls (ADR-044)."""

from abc import ABC, abstractmethod

from shared.generated.models import (
    ApiProcessingResultsPostRequest,
    ApiProcessingResultsPostResponse,
    ApiSearchGraphPostResponse,
    ApiSearchVectorPostResponse,
)


class HttpClientBase(ABC):
    @abstractmethod
    async def post_processing_results(
        self, payload: ApiProcessingResultsPostRequest
    ) -> ApiProcessingResultsPostResponse: ...

    @abstractmethod
    async def vector_search(
        self, embedding: list[float], top_k: int
    ) -> ApiSearchVectorPostResponse: ...

    @abstractmethod
    async def graph_search(
        self, entity_names: list[str], max_depth: int
    ) -> ApiSearchGraphPostResponse: ...

    @abstractmethod
    async def aclose(self) -> None: ...
