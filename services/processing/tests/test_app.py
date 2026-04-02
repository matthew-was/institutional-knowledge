from collections.abc import AsyncGenerator

import httpx
import pytest

from app import app
from shared.config import config

VALID_KEY = config.AUTH.INBOUND_KEY
INVALID_KEY = "invalid_key"


@pytest.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


@pytest.mark.ci_integration
async def test_health_route_no_auth(client: httpx.AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


@pytest.mark.ci_integration
async def test_api_success_with_auth(client: httpx.AsyncClient) -> None:
    r = await client.post("/process", headers={"x-internal-key": VALID_KEY})
    assert r.status_code == 501
    assert r.json()["detail"] == "Not implemented"


@pytest.mark.ci_integration
async def test_api_process_fail_with_wrong_auth(client: httpx.AsyncClient) -> None:
    r = await client.post("/process", headers={"x-internal-key": INVALID_KEY})
    assert r.status_code == 401


@pytest.mark.ci_integration
async def test_api_process_fail_with_no_auth(client: httpx.AsyncClient) -> None:
    r = await client.post("/process")
    assert r.status_code == 401


@pytest.mark.ci_integration
async def test_api_query_fail_with_no_auth(client: httpx.AsyncClient) -> None:
    r = await client.post("/query")
    assert r.status_code == 401
