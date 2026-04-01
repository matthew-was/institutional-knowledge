import json
from itertools import repeat
from uuid import UUID

import httpx
import pytest
import respx
import structlog

from shared.adapters.http_client import ExpressCallError
from shared.config import config
from shared.factories.http_client import create_http_client
from shared.generated.models import (
    ApiProcessingResultsPostRequest,
    Chunk,
    Metadata,
    Status5,
    StepResults,
)
from shared.interfaces.http_client import HttpClientBase


@pytest.fixture
def http_client() -> HttpClientBase:
    return create_http_client(config=config, log=structlog.get_logger())


document_id = UUID("cd50d49f-20c5-46d2-9a78-4b3042f9b9d0")


def make_payload() -> ApiProcessingResultsPostRequest:
    return ApiProcessingResultsPostRequest(
        documentId=document_id,
        stepResults={
            "ocr": StepResults(status=Status5.completed, errorMessage=""),
        },
        flags=[],
        metadata=Metadata(
            documentType="letter",
            dates=["1952-04-01"],
            people=["John Smith"],
            organisations=[],
            landReferences=[],
            description="A test document",
        ),
        chunks=[
            Chunk(
                chunkIndex=0, text="Some text", tokenCount=2, embedding=[0.1, 0.2, 0.3]
            ),
        ],
        entities=[],
        relationships=[],
    )


@pytest.mark.ci_integration
@respx.mock
async def test_auth_header(
    http_client: HttpClientBase, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/processing/results").mock(
        httpx.Response(
            200,
            json={
                "documentId": str(document_id),
                "accepted": True,
            },
        )
    )
    payload = make_payload()
    response = await http_client.post_processing_results(payload=payload)
    request = respx_mock.calls.last.request
    assert request.headers["x-internal-key"] == config.AUTH.EXPRESS_KEY
    assert response.accepted
    assert response.documentId == document_id


@pytest.mark.ci_integration
@respx.mock
async def test_serialization_snake_to_camel(
    http_client: HttpClientBase, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/search/vector").mock(
        httpx.Response(
            200,
            json={
                "results": [
                    {
                        "chunkId": "00000000-0000-0000-0000-000000000001",
                        "documentId": str(document_id),
                        "text": "Some text",
                        "chunkIndex": 0,
                        "tokenCount": 2,
                        "similarityScore": 0.95,
                        "document": {
                            "description": "A test document",
                            "date": "1952-04-01",
                            "documentType": "letter",
                        },
                    }
                ]
            },
        )
    )
    response = await http_client.vector_search(embedding=[0.1, 0.2, 0.3], top_k=5)
    request = respx_mock.calls.last.request
    request_body = json.loads(request.content)
    result = response.results[0]
    assert request.headers["x-internal-key"] == config.AUTH.EXPRESS_KEY
    assert request_body["topK"] == 5
    assert "top_k" not in request_body
    assert len(response.results) == 1
    assert result.documentId == document_id


@pytest.mark.ci_integration
@respx.mock
async def test_retry_on_5xx(
    http_client: HttpClientBase, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/processing/results").mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(
                200,
                json={
                    "documentId": str(document_id),
                    "accepted": True,
                },
            ),
        ],
    )
    payload = make_payload()
    response = await http_client.post_processing_results(payload=payload)
    assert respx_mock.calls.call_count == 2
    assert response.accepted
    assert response.documentId == document_id


@pytest.mark.ci_integration
@respx.mock
async def test_fail_on_multiple_5xx(
    http_client: HttpClientBase, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/processing/results").mock(
        side_effect=repeat(httpx.Response(503))
    )
    payload = make_payload()
    with pytest.raises(ExpressCallError) as exc_info:
        await http_client.post_processing_results(payload=payload)
    assert respx_mock.calls.call_count == config.SERVICE.HTTP.RETRY_COUNT
    assert exc_info.value.status_code == 503


@pytest.mark.ci_integration
@respx.mock
async def test_4xx_immediate_return(
    http_client: HttpClientBase, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/processing/results").mock(httpx.Response(401))
    payload = make_payload()
    with pytest.raises(ExpressCallError) as exc_info:
        await http_client.post_processing_results(payload=payload)
    assert respx_mock.calls.call_count == 1
    assert exc_info.value.status_code == 401


@pytest.mark.ci_integration
async def test_graph_search_not_implemented(
    http_client: HttpClientBase,
) -> None:
    with pytest.raises(NotImplementedError):
        await http_client.graph_search(entity_names=[], max_depth=1)
