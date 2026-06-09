"""Fake HttpClientBase implementation for Tier 2 tests."""

from shared.generated.models import (
    ApiProcessingResultsPostRequest,
    ApiProcessingResultsPostResponse,
    ApiSearchGraphPostResponse,
    ApiSearchVectorPostResponse,
)
from shared.interfaces.http_client import HttpClientBase


class FakeHttpClient(HttpClientBase):
    """Fake HTTP client that records calls and returns configurable responses."""

    def __init__(self) -> None:
        self.post_processing_results_calls: list[ApiProcessingResultsPostRequest] = []

    async def post_processing_results(
        self, payload: ApiProcessingResultsPostRequest
    ) -> ApiProcessingResultsPostResponse:
        self.post_processing_results_calls.append(payload)
        return ApiProcessingResultsPostResponse(
            documentId=payload.documentId,
            accepted=True,
        )

    async def vector_search(
        self, embedding: list[float], top_k: int
    ) -> ApiSearchVectorPostResponse:
        return ApiSearchVectorPostResponse(results=[])

    async def graph_search(
        self, entity_names: list[str], max_depth: int
    ) -> ApiSearchGraphPostResponse:
        raise NotImplementedError("graph_search is not implemented in Phase 1")

    async def aclose(self) -> None:
        return None
