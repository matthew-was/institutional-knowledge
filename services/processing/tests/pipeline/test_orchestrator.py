"""Tests for the PipelineOrchestrator (Task 18)."""

import pytest
import structlog

from pipeline.interfaces.completeness_scorer import MetadataCompletenessScorer
from pipeline.interfaces.ocr_service import OCRResult
from pipeline.interfaces.text_quality_scorer import TextQualityScorer
from pipeline.orchestrator import (
    STEP_EMBEDDING_GENERATION,
    STEP_LLM_COMBINED_PASS,
    STEP_METADATA_COMPLETENESS_SCORING,
    STEP_PATTERN_METADATA_EXTRACTION,
    STEP_TEXT_EXTRACTION,
    STEP_TEXT_QUALITY_SCORING,
    PipelineOrchestrator,
    PreviousOutputs,
    ProcessingRequest,
)
from shared.config import EmbeddingConfig, LLMConfig
from shared.interfaces.embedding_service import EmbeddingResult
from shared.interfaces.llm_service import (
    ChunkResult,
    EntityResult,
    LLMCombinedResult,
    RelationshipResult,
)
from tests.fakes.completeness_scorer import (
    FailingCompletenessScorer,
    PassingCompletenessScorer,
)
from tests.fakes.embedding_service import create_mock_embedding_service
from tests.fakes.http_client import FakeHttpClient
from tests.fakes.llm_service import create_mock_llm_service
from tests.fakes.metadata_extractor import MinimalMetadataExtractor
from tests.fakes.ocr_service import create_mock_ocr_service
from tests.fakes.quality_scorer import FailingQualityScorer, PassingQualityScorer

ALL_STEPS = [
    STEP_TEXT_EXTRACTION,
    STEP_TEXT_QUALITY_SCORING,
    STEP_PATTERN_METADATA_EXTRACTION,
    STEP_METADATA_COMPLETENESS_SCORING,
    STEP_LLM_COMBINED_PASS,
    STEP_EMBEDDING_GENERATION,
]

_EMBEDDING_DIMENSION = 3


def make_llm_config() -> LLMConfig:
    return LLMConfig(
        PROVIDER="ollama",
        BASE_URL="http://localhost:11434",
        MODEL="test-model",
        CHUNKING_MIN_TOKENS=10,
        CHUNKING_MAX_TOKENS=500,
    )


def make_embedding_config() -> EmbeddingConfig:
    return EmbeddingConfig(
        PROVIDER="ollama",
        BASE_URL="http://localhost:11434",
        MODEL="test-embedding-model",
        DIMENSION=_EMBEDDING_DIMENSION,
    )


def make_ocr_result(pages: list[str] | None = None) -> OCRResult:
    pages = pages or ["Page one text.", "Page two text."]
    return OCRResult(
        text_per_page=pages,
        confidence_per_page=[0.95] * len(pages),
        extraction_method="docling",
        page_count=len(pages),
    )


def make_orchestrator(
    *,
    ocr_result: OCRResult | None = None,
    llm_result: LLMCombinedResult | None = None,
    embedding_result: EmbeddingResult | None = None,
    quality_scorer: TextQualityScorer | None = None,
    completeness_scorer: MetadataCompletenessScorer | None = None,
    http_client: FakeHttpClient | None = None,
) -> tuple[PipelineOrchestrator, FakeHttpClient]:
    fake_http = http_client or FakeHttpClient()
    ocr = create_mock_ocr_service(ocr_result or make_ocr_result())
    llm = create_mock_llm_service(llm_result)
    embedding = create_mock_embedding_service(
        embedding_result
        or EmbeddingResult(
            embedding=[0.1] * _EMBEDDING_DIMENSION,
            dimension=_EMBEDDING_DIMENSION,
            model="test-embedding-model",
        )
    )
    scorer = quality_scorer or PassingQualityScorer()
    completeness = completeness_scorer or PassingCompletenessScorer()

    orchestrator = PipelineOrchestrator(
        ocr_service=ocr,
        quality_scorer=scorer,
        metadata_extractor=MinimalMetadataExtractor(),
        completeness_scorer=completeness,
        llm_service=llm,
        embedding_service=embedding,
        http_client=fake_http,
        llm_config=make_llm_config(),
        embedding_config=make_embedding_config(),
        log=structlog.get_logger(),
    )
    return orchestrator, fake_http


_DOCUMENT_ID = "00000000-0000-0000-0000-000000000001"
_REENTRANT_DOCUMENT_ID = "00000000-0000-0000-0000-000000000002"


def make_full_request(document_id: str = _DOCUMENT_ID) -> ProcessingRequest:
    return ProcessingRequest(
        document_id=document_id,
        file_reference="/data/test.pdf",
        incomplete_steps=ALL_STEPS,
        previous_outputs=None,
    )


@pytest.mark.ci_integration
async def test_reentrancy_skips_extraction_and_uses_previous_outputs() -> None:
    """When text_extraction is not in incomplete_steps, step 1 is skipped
    and previous_outputs text is used for downstream steps."""
    previous = PreviousOutputs(
        extracted_text="Previously extracted text.",
        text_per_page=["Previously extracted text."],
        confidence_per_page=[0.9],
        metadata=None,
    )
    request = ProcessingRequest(
        document_id=_REENTRANT_DOCUMENT_ID,
        file_reference="/data/test.pdf",
        # text_extraction is intentionally absent — re-entrancy
        incomplete_steps=[
            STEP_TEXT_QUALITY_SCORING,
            STEP_PATTERN_METADATA_EXTRACTION,
            STEP_METADATA_COMPLETENESS_SCORING,
            STEP_LLM_COMBINED_PASS,
            STEP_EMBEDDING_GENERATION,
        ],
        previous_outputs=previous,
    )

    orchestrator, fake_http = make_orchestrator()
    response = await orchestrator.process(request)

    # Step 1 was not run — it should not appear in step_results
    assert STEP_TEXT_EXTRACTION not in response.step_results

    # The pipeline completed using previous_outputs text
    assert STEP_TEXT_QUALITY_SCORING in response.step_results
    assert response.step_results[STEP_TEXT_QUALITY_SCORING].status == "completed"

    # Express was called with the result
    assert len(fake_http.post_processing_results_calls) == 1


@pytest.mark.ci_integration
async def test_flag_from_step_1_halts_pipeline() -> None:
    """A DocumentFlag produced by OCR extraction halts the pipeline;
    steps 2–6 do not run and the response contains the extraction flag."""
    # OCR returns zero pages — causes extraction_failure flag in step 1
    empty_result = OCRResult(
        text_per_page=[],
        confidence_per_page=[],
        extraction_method="docling",
        page_count=0,
    )
    orchestrator, fake_http = make_orchestrator(ocr_result=empty_result)
    request = make_full_request()
    response = await orchestrator.process(request)

    # Step 1 ran and produced a flag
    assert STEP_TEXT_EXTRACTION in response.step_results

    # Steps 2–6 must not have run
    assert STEP_TEXT_QUALITY_SCORING not in response.step_results
    assert STEP_PATTERN_METADATA_EXTRACTION not in response.step_results
    assert STEP_METADATA_COMPLETENESS_SCORING not in response.step_results
    assert STEP_LLM_COMBINED_PASS not in response.step_results
    assert STEP_EMBEDDING_GENERATION not in response.step_results

    # Response carries the extraction flag
    assert len(response.flags) > 0
    assert response.flags[0].type == "extraction_failure"

    # Downstream fields are None
    assert response.metadata is None
    assert response.chunks is None
    assert response.entities is None

    # Express was called
    assert len(fake_http.post_processing_results_calls) == 1


@pytest.mark.ci_integration
async def test_combined_flag_when_both_quality_and_completeness_fail() -> None:
    """When both text quality and completeness thresholds fail, the response
    contains exactly one flag with both failure reasons merged."""
    orchestrator, fake_http = make_orchestrator(
        quality_scorer=FailingQualityScorer(),
        completeness_scorer=FailingCompletenessScorer(),
        llm_result=None,  # LLM not needed for flag assertion
    )
    request = make_full_request()
    response = await orchestrator.process(request)

    # Must be exactly one flag — the combined flag
    assert len(response.flags) == 1
    merged_flag = response.flags[0]
    assert merged_flag.type == "quality_and_completeness_failure"
    # Both sub-reasons must appear in the merged reason string — one from each
    # quality flag reason ("quality threshold") and completeness flag reason
    # ("completeness score"), confirming both were concatenated.
    assert "quality threshold" in merged_flag.reason
    assert "completeness score" in merged_flag.reason

    # Express was called once
    assert len(fake_http.post_processing_results_calls) == 1


@pytest.mark.ci_integration
async def test_full_pipeline_returns_non_none_chunks_and_entities() -> None:
    """When no threshold fails, all six steps run and the response
    includes non-None chunks and entities."""
    # LLM returns one chunk and one entity
    llm_result = LLMCombinedResult(
        chunks=[
            ChunkResult(text="This is a test chunk.", chunk_index=0, token_count=5)
        ],
        metadata_fields={"description": "A test document description"},
        entities=[
            EntityResult(
                name="John Smith",
                type="People",
                confidence=0.95,
                normalised_name="john smith",
            )
        ],
        relationships=[
            RelationshipResult(
                source_entity_name="John Smith",
                target_entity_name="East Meadow",
                relationship_type="owned_by",
                confidence=0.88,
            )
        ],
    )
    orchestrator, fake_http = make_orchestrator(
        llm_result=llm_result,
        quality_scorer=PassingQualityScorer(),
        completeness_scorer=PassingCompletenessScorer(),
    )
    request = make_full_request()
    response = await orchestrator.process(request)

    # All six steps ran
    assert STEP_TEXT_EXTRACTION in response.step_results
    assert STEP_TEXT_QUALITY_SCORING in response.step_results
    assert STEP_PATTERN_METADATA_EXTRACTION in response.step_results
    assert STEP_METADATA_COMPLETENESS_SCORING in response.step_results
    assert STEP_LLM_COMBINED_PASS in response.step_results
    assert STEP_EMBEDDING_GENERATION in response.step_results

    # No flags
    assert len(response.flags) == 0

    # Chunks and entities are non-None
    if response.chunks is None:
        pytest.fail("response.chunks should not be None when full pipeline runs")
    assert len(response.chunks) > 0

    if response.entities is None:
        pytest.fail("response.entities should not be None when full pipeline runs")
    assert len(response.entities) > 0
    assert response.entities[0].name == "John Smith"

    # Express was called once
    assert len(fake_http.post_processing_results_calls) == 1
