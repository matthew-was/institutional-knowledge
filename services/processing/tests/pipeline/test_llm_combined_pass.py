import httpx
import pytest
import respx
import structlog

from shared.adapters.ollama_llm import OllamaLLMAdapter
from shared.config import LLMConfig
from shared.factories.llm_factory import create_llm_service
from shared.interfaces.llm_service import LLMService


@pytest.fixture
def llm_service() -> LLMService:
    config = LLMConfig(
        CHUNKING_MIN_TOKENS=100,
        CHUNKING_MAX_TOKENS=1000,
        PROVIDER="ollama",
        BASE_URL="http://test:11343",
        MODEL="mistral",
    )
    return create_llm_service(config=config, log=structlog.get_logger())


@pytest.mark.ci_integration
@respx.mock
def test_valid_json_response(
    llm_service: LLMService, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/generate").mock(
        httpx.Response(
            200,
            json={
                "response": '{"chunks": [{"text": "John Smith conveyed land to William Jones.", "chunk_index": 0, "token_count": 9}], "metadata_fields": {"document_type": "deed", "dates": ["1 January 1952"], "people": ["John Smith", "William Jones"], "land_references": ["Field 4, Lower Meadow"], "organisations": [], "description": "A land conveyance deed."}, "entities": [{"name": "John Smith", "type": "People", "confidence": 0.95, "normalised_name": "john smith"}, {"name": "William Jones", "type": "People", "confidence": 0.9, "normalised_name": "william jones"}], "relationships": [{"source_entity_name": "John Smith", "target_entity_name": "William Jones", "relationship_type": "transferred_to", "confidence": 0.9}]}'  # noqa: E501
            },
        )
    )

    result = llm_service.combined_pass(
        text="John Smith conveyed land to William Jones.", document_type="deed"
    )

    assert result is not None
    assert len(result.chunks) == 1
    assert result.chunks[0].text == "John Smith conveyed land to William Jones."
    assert result.metadata_fields["description"] == "A land conveyance deed."
    assert result.entities[0].name == "John Smith"
    assert result.relationships[0].relationship_type == "transferred_to"


@pytest.mark.ci_integration
@respx.mock
def test_malformed_json_response_returns_none(
    llm_service: LLMService, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/generate").mock(
        httpx.Response(
            200,
            json={"response": "not json"},
        )
    )

    result = llm_service.combined_pass(
        text="John Smith conveyed land to William Jones.", document_type="deed"
    )

    assert result is None


@pytest.mark.ci_integration
@respx.mock
def test_missing_response_field_returns_none(
    llm_service: LLMService, respx_mock: respx.MockRouter
) -> None:
    respx_mock.post("/api/generate").mock(
        httpx.Response(
            200,
            json={
                "response": '{"metadata_fields": {"document_type": "deed", "dates": ["1 January 1952"], "people": ["John Smith", "William Jones"], "land_references": ["Field 4, Lower Meadow"], "organisations": [], "description": "A land conveyance deed."}, "entities": [{"name": "John Smith", "type": "People", "confidence": 0.95, "normalised_name": "john smith"}, {"name": "William Jones", "type": "People", "confidence": 0.9, "normalised_name": "william jones"}], "relationships": [{"source_entity_name": "John Smith", "target_entity_name": "William Jones", "relationship_type": "transferred_to", "confidence": 0.9}]}'  # noqa: E501
            },
        )
    )

    result = llm_service.combined_pass(
        text="John Smith conveyed land to William Jones.", document_type="deed"
    )

    assert result is None


def test_llm_service_creates_ollama_service() -> None:
    config = LLMConfig(
        CHUNKING_MIN_TOKENS=100,
        CHUNKING_MAX_TOKENS=1000,
        PROVIDER="ollama",
        BASE_URL="http://test:11343",
        MODEL="mistral",
    )
    llm_service = create_llm_service(config=config, log=structlog.get_logger())

    assert isinstance(llm_service, OllamaLLMAdapter)


def test_llm_service_raises_error_for_unknown_provider() -> None:
    config = LLMConfig(
        CHUNKING_MIN_TOKENS=100,
        CHUNKING_MAX_TOKENS=1000,
        PROVIDER="unknown",
        BASE_URL="http://test:11343",
        MODEL="mistral",
    )

    with pytest.raises(ValueError) as exc_info:
        create_llm_service(config=config, log=structlog.get_logger())
    assert str(exc_info.value) == "unknown is not a supported LLM Service Provider"
