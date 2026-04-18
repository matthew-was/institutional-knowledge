import httpx
import pytest
import respx
import structlog

from pipeline.steps.llm_combined_pass import (
    LLMCombinedPassResult,
    run_llm_combined_pass,
)
from shared.adapters.ollama_llm import OllamaLLMAdapter
from shared.config import LLMConfig
from shared.factories.llm_factory import create_llm_service
from shared.interfaces.llm_service import ChunkResult, LLMCombinedResult, LLMService
from tests.fakes.llm_service import create_mock_llm_service


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


llm_combined_pass_text = ""

llm_combined_pass_config = LLMConfig(
    CHUNKING_MIN_TOKENS=10,
    CHUNKING_MAX_TOKENS=100,
    PROVIDER="ollama",
    BASE_URL="http://test:11343",
    MODEL="mistral",
)


@pytest.mark.ci_integration
def test_two_chunks_below_min_tokens() -> None:
    llm_combined_pass_merge_response = LLMCombinedResult(
        chunks=[
            ChunkResult(
                text="AA",
                chunk_index=0,
                token_count=2,
            ),
            ChunkResult(text="BBB", chunk_index=1, token_count=3),
        ],
        metadata_fields={"document_type": "deed"},
        entities=[],
        relationships=[],
    )
    mock_llm_service = create_mock_llm_service(llm_combined_pass_merge_response)
    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        config=llm_combined_pass_config,
        document_type=None,
        llm_service=mock_llm_service,
        log=structlog.get_logger(),
    )

    if result is None or result.result is None:
        pytest.fail("step returned no result")

    assert result.step_status == "completed"

    assert result.result.entities == llm_combined_pass_merge_response.entities
    assert (
        result.result.metadata_fields
        == llm_combined_pass_merge_response.metadata_fields
    )
    assert len(result.result.chunks) == 1
    assert result.result.chunks[0].text == "AA BBB"
    assert result.result.chunks[0].chunk_index == 0
    assert result.result.chunks[0].token_count == 6


@pytest.mark.ci_integration
def test_split_chunk_above_max_tokens() -> None:
    llm_combined_pass_split_response = LLMCombinedResult(
        chunks=[
            ChunkResult(
                text="A" * 150,
                chunk_index=0,
                token_count=150,
            )
        ],
        metadata_fields={"document_type": "deed"},
        entities=[],
        relationships=[],
    )
    mock_llm_service = create_mock_llm_service(llm_combined_pass_split_response)
    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        config=llm_combined_pass_config,
        document_type=None,
        llm_service=mock_llm_service,
        log=structlog.get_logger(),
    )

    if result is None or result.result is None:
        pytest.fail("step returned no result")

    assert result.step_status == "completed"

    assert result.result.entities == llm_combined_pass_split_response.entities
    assert (
        result.result.metadata_fields
        == llm_combined_pass_split_response.metadata_fields
    )
    assert len(result.result.chunks) == 2
    assert len(result.result.chunks[0].text) == 100
    assert len(result.result.chunks[1].text) == 50
    assert result.result.chunks[0].chunk_index == 0
    assert result.result.chunks[1].chunk_index == 1
    assert result.result.chunks[0].token_count == 100
    assert result.result.chunks[1].token_count == 50


@pytest.mark.ci_integration
def test_chunks_above_and_below_token_count_re_indexed() -> None:
    llm_combined_pass_mixed_response = LLMCombinedResult(
        chunks=[
            ChunkResult(
                text="A" * 150,
                chunk_index=0,
                token_count=150,
            ),
            ChunkResult(
                text="Short.",
                chunk_index=1,
                token_count=6,
            ),
            ChunkResult(
                text="B" * 40,
                chunk_index=2,
                token_count=40,
            ),
        ],
        metadata_fields={"document_type": "deed"},
        entities=[],
        relationships=[],
    )
    mock_llm_service = create_mock_llm_service(llm_combined_pass_mixed_response)
    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        config=llm_combined_pass_config,
        document_type=None,
        llm_service=mock_llm_service,
        log=structlog.get_logger(),
    )

    if result is None or result.result is None:
        pytest.fail("step returned no result")

    assert result.step_status == "completed"

    assert result.result.entities == llm_combined_pass_mixed_response.entities
    assert (
        result.result.metadata_fields
        == llm_combined_pass_mixed_response.metadata_fields
    )
    assert len(result.result.chunks) == 2
    assert len(result.result.chunks[0].text) == 100
    assert len(result.result.chunks[1].text) == 98
    assert result.result.chunks[0].chunk_index == 0
    assert result.result.chunks[1].chunk_index == 1
    assert result.result.chunks[0].token_count == 100
    assert result.result.chunks[1].token_count == 98


@pytest.mark.ci_integration
def test_multi_paragraph_chunk_splits_and_flushes_correctly() -> None:
    _para_a = "A" * 50
    _para_b = "B" * 40
    _para_c = "C" * 60
    llm_combined_pass_multi_paragraph_response = LLMCombinedResult(
        chunks=[
            ChunkResult(
                text=f"{_para_a}\n\n{_para_b}\n\n{_para_c}",
                chunk_index=0,
                token_count=0,
            )
        ],
        metadata_fields={},
        entities=[],
        relationships=[],
    )
    mock_llm_service = create_mock_llm_service(
        llm_combined_pass_multi_paragraph_response
    )
    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        config=llm_combined_pass_config,
        document_type=None,
        llm_service=mock_llm_service,
        log=structlog.get_logger(),
    )

    if result is None or result.result is None:
        pytest.fail("step returned no result")

    assert len(result.result.chunks) == 2
    assert len(result.result.chunks[0].text) == 92
    assert len(result.result.chunks[1].text) == 60
    assert result.result.chunks[0].chunk_index == 0
    assert result.result.chunks[1].chunk_index == 1
    assert result.result.chunks[0].token_count == 92
    assert result.result.chunks[1].token_count == 60


@pytest.mark.ci_integration
def test_oversized_paragraph_splits_to_sentences_under_max() -> None:
    _sentence_a = "F" * 60
    _sentence_b = "G" * 60
    llm_combined_pass_sentence_split_response = LLMCombinedResult(
        chunks=[
            ChunkResult(
                text=f"{_sentence_a}. {_sentence_b}",
                chunk_index=0,
                token_count=0,
            )
        ],
        metadata_fields={},
        entities=[],
        relationships=[],
    )
    mock_llm_service = create_mock_llm_service(
        llm_combined_pass_sentence_split_response
    )
    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        config=llm_combined_pass_config,
        document_type=None,
        llm_service=mock_llm_service,
        log=structlog.get_logger(),
    )

    if result is None or result.result is None:
        pytest.fail("step returned no result")

    assert len(result.result.chunks) == 2
    assert len(result.result.chunks[0].text) == 60
    assert len(result.result.chunks[1].text) == 60
    assert result.result.chunks[0].chunk_index == 0
    assert result.result.chunks[1].chunk_index == 1
    assert result.result.chunks[0].token_count == 60
    assert result.result.chunks[1].token_count == 60


@pytest.mark.ci_integration
def test_last_chunk_below_min_merges_into_previous() -> None:
    llm_combined_pass_last_chunk_merges_response = LLMCombinedResult(
        chunks=[
            ChunkResult(text="H" * 40, chunk_index=0, token_count=0),
            ChunkResult(text="end.", chunk_index=1, token_count=0),
        ],
        metadata_fields={},
        entities=[],
        relationships=[],
    )
    mock_llm_service = create_mock_llm_service(
        llm_combined_pass_last_chunk_merges_response
    )
    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        config=llm_combined_pass_config,
        document_type=None,
        llm_service=mock_llm_service,
        log=structlog.get_logger(),
    )

    if result is None or result.result is None:
        pytest.fail("step returned no result")

    assert len(result.result.chunks) == 1
    assert len(result.result.chunks[0].text) == 45
    assert result.result.chunks[0].chunk_index == 0
    assert result.result.chunks[0].token_count == 45


@pytest.mark.ci_integration
def test_last_chunk_below_min_kept_when_combined_exceeds_max() -> None:
    llm_combined_pass_last_chunk_no_merge_response = LLMCombinedResult(
        chunks=[
            ChunkResult(text="I" * 97, chunk_index=0, token_count=0),
            ChunkResult(text="end.", chunk_index=1, token_count=0),
        ],
        metadata_fields={},
        entities=[],
        relationships=[],
    )
    mock_llm_service = create_mock_llm_service(
        llm_combined_pass_last_chunk_no_merge_response
    )
    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        config=llm_combined_pass_config,
        document_type=None,
        llm_service=mock_llm_service,
        log=structlog.get_logger(),
    )

    if result is None or result.result is None:
        pytest.fail("step returned no result")

    assert len(result.result.chunks) == 2
    assert len(result.result.chunks[0].text) == 97
    assert len(result.result.chunks[1].text) == 4
    assert result.result.chunks[0].chunk_index == 0
    assert result.result.chunks[1].chunk_index == 1
    assert result.result.chunks[0].token_count == 97
    assert result.result.chunks[1].token_count == 4


@pytest.mark.ci_integration
def test_none_result_from_service_returns_empty_result() -> None:
    mock_llm_service = create_mock_llm_service(None)

    result = run_llm_combined_pass(
        text=llm_combined_pass_text,
        document_type=None,
        llm_service=mock_llm_service,
        config=llm_combined_pass_config,
        log=structlog.get_logger(),
    )

    assert isinstance(result, LLMCombinedPassResult)
    assert result.result is None
    assert result.step_status == "failed"
