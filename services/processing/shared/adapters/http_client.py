"""Outbound HTTP client for all Express API calls (ADR-044)."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

import httpx
import structlog

from shared.config import AppConfig
from shared.generated.models import (
    ApiProcessingResultsPostRequest,
    ApiProcessingResultsPostResponse,
    ApiSearchGraphPostResponse,
    ApiSearchVectorPostRequest,
    ApiSearchVectorPostResponse,
)
from shared.interfaces.http_client import HttpClientBase

T = TypeVar("T")


class ExpressCallError(Exception):
    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"Express call failed with status {status_code}: {body}")
        self.status_code = status_code
        self.body = body


class HttpClient(HttpClientBase):
    def __init__(self, config: AppConfig, log: structlog.BoundLogger) -> None:
        self.config = config
        self.log = log.bind(service="http_client")
        headers = {"x-internal-key": config.AUTH.EXPRESS_KEY}
        base_url = config.SERVICE.EXPRESS_BASE_URL
        self.client = httpx.AsyncClient(headers=headers, base_url=base_url)

    async def aclose(self) -> None:
        await self.client.aclose()

    async def _with_retry(self, call: Callable[[], Awaitable[T]]) -> T:
        for attempt in range(self.config.SERVICE.HTTP.RETRY_COUNT):
            try:
                r = await call()
                r.raise_for_status()
                return r
            except httpx.TransportError as exc:
                if attempt < self.config.SERVICE.HTTP.RETRY_COUNT - 1:
                    self.log.warning(
                        "retrying express call, transport error",
                        attempt=attempt,
                        status_code=0,
                    )
                    await asyncio.sleep(self.config.SERVICE.HTTP.RETRY_DELAY_MS / 1000)
                else:
                    self.log.error(
                        "express call failed after retries, transport error",
                        attempts=self.config.SERVICE.HTTP.RETRY_COUNT,
                    )
                    raise ExpressCallError(0, str(exc))
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code < 500:
                    raise ExpressCallError(exc.response.status_code, exc.response.text)
                elif attempt < self.config.SERVICE.HTTP.RETRY_COUNT - 1:
                    self.log.warning(
                        "retrying express call",
                        attempt=attempt,
                        status_code=exc.response.status_code,
                    )
                    await asyncio.sleep(self.config.SERVICE.HTTP.RETRY_DELAY_MS / 1000)
                else:
                    self.log.error(
                        "express call failed after retries",
                        attempts=self.config.SERVICE.HTTP.RETRY_COUNT,
                    )
                    raise ExpressCallError(exc.response.status_code, exc.response.text)

    async def post_processing_results(
        self, payload: ApiProcessingResultsPostRequest
    ) -> ApiProcessingResultsPostResponse:
        response = await self._with_retry(
            lambda: self.client.post(
                "/api/processing/results", json=payload.model_dump(mode="json")
            )
        )
        return ApiProcessingResultsPostResponse.model_validate(response.json())

    async def vector_search(
        self, embedding: list[float], top_k: int
    ) -> ApiSearchVectorPostResponse:
        payload = ApiSearchVectorPostRequest(embedding=embedding, topK=top_k)
        response = await self._with_retry(
            lambda: self.client.post(
                "/api/search/vector", json=payload.model_dump(mode="json")
            )
        )
        return ApiSearchVectorPostResponse.model_validate(response.json())

    async def graph_search(
        self, entity_names: list[str], max_depth: int
    ) -> ApiSearchGraphPostResponse:
        raise NotImplementedError()
