import httpx
import pytest
import respx
import structlog

from shared.adapters.ollama_embedding import OllamaEmbeddingAdapter
from shared.config import EmbeddingConfig
from shared.factories.embedding_factory import create_embedding_service
from shared.interfaces.embedding_service import EmbeddingService

embedding_config = EmbeddingConfig(
    PROVIDER="ollama",
    BASE_URL="http://test:11434",
    MODEL="test-embed-model",
    DIMENSION=3,
)


@pytest.mark.ci_integration
@respx.mock
async def test_matching_dimension_returns_embedding_result(
    respx_mock: respx.MockRouter,
) -> None:
    test_embedding = [0.1, 0.2, 0.3]
    respx_mock.post("/api/embeddings").mock(
        httpx.Response(200, json={"embedding": test_embedding})
    )
    adapter = OllamaEmbeddingAdapter(
        config=embedding_config, log=structlog.get_logger()
    )

    result = await adapter.embed("Some archive text.")

    assert result.embedding == test_embedding
    assert result.dimension == 3
    assert result.model == embedding_config.MODEL


@pytest.mark.ci_integration
@respx.mock
async def test_mismatched_dimension_raises_value_error(
    respx_mock: respx.MockRouter,
) -> None:
    mismatched_config = EmbeddingConfig(
        PROVIDER="ollama",
        BASE_URL="http://test:11434",
        MODEL="test-embed-model",
        DIMENSION=5,
    )
    respx_mock.post("/api/embeddings").mock(
        httpx.Response(200, json={"embedding": [0.1, 0.2, 0.3]})
    )
    adapter = OllamaEmbeddingAdapter(
        config=mismatched_config, log=structlog.get_logger()
    )

    with pytest.raises(ValueError) as exc_info:
        _ = await adapter.embed(text="Some archive text")
    assert (
        str(exc_info.value) == "ollama embedding dimension mismatch: expected 5, got 3"
    )


@pytest.mark.ci_integration
async def test_factory_returns_ollama_embedding_service() -> None:
    result = create_embedding_service(
        config=embedding_config, log=structlog.get_logger()
    )

    assert isinstance(result, EmbeddingService)
    assert isinstance(result, OllamaEmbeddingAdapter)


@pytest.mark.ci_integration
async def test_factory_raises_for_unknown_provider() -> None:
    unknown_config = EmbeddingConfig(
        PROVIDER="unknown",
        BASE_URL="http://test:11434",
        MODEL="test-embed-model",
        DIMENSION=3,
    )

    with pytest.raises(ValueError) as exc_info:
        create_embedding_service(config=unknown_config, log=structlog.get_logger())
    assert (
        str(exc_info.value) == "unknown is not a supported Embedding Service Provider"
    )


@pytest.mark.ci_integration
@respx.mock
async def test_empty_embedding_response_raises_value_error(
    respx_mock: respx.MockRouter,
) -> None:
    respx_mock.post("/api/embeddings").mock(httpx.Response(200, json={"embedding": []}))
    adapter = OllamaEmbeddingAdapter(
        config=embedding_config, log=structlog.get_logger()
    )

    with pytest.raises(ValueError) as exc_info:
        _ = await adapter.embed(text="Some archive text")

    assert (
        str(exc_info.value) == "ollama embeddings response was empty: embedding_data=0"
    )


@pytest.mark.ci_integration
@respx.mock
async def test_missing_embedding_key_raises_value_error(
    respx_mock: respx.MockRouter,
) -> None:
    respx_mock.post("/api/embeddings").mock(
        httpx.Response(200, json={"something_else": [0.1, 0.2, 0.3]})
    )
    adapter = OllamaEmbeddingAdapter(
        config=embedding_config, log=structlog.get_logger()
    )

    with pytest.raises(ValueError) as exc_info:
        _ = await adapter.embed(text="Some archive text")

    assert (
        str(exc_info.value)
        == "ollama embeddings response was None: embedding_data=None"
    )


@pytest.mark.ci_integration
@respx.mock
async def test_http_status_error_propagates(
    respx_mock: respx.MockRouter,
) -> None:
    respx_mock.post("/api/embeddings").mock(httpx.Response(500))
    adapter = OllamaEmbeddingAdapter(
        config=embedding_config, log=structlog.get_logger()
    )

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        _ = await adapter.embed(text="Some archive text")

    assert exc_info.value.response.status_code == 500


@pytest.mark.ci_integration
@respx.mock
async def test_transport_error_propagates(
    respx_mock: respx.MockRouter,
) -> None:
    respx_mock.post("/api/embeddings").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    adapter = OllamaEmbeddingAdapter(
        config=embedding_config, log=structlog.get_logger()
    )

    with pytest.raises(httpx.TransportError) as exc_info:
        _ = await adapter.embed("Some archive text.")
    assert isinstance(exc_info.value, httpx.ConnectError)
