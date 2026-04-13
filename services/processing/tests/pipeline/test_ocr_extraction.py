import pytest
import structlog

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.tesseract_ocr import TesseractAdapter
from pipeline.factories.ocr_factory import create_ocr_service
from pipeline.interfaces.ocr_service import (
    FileOpenError,
    OCRResult,
    OCRService,
)
from pipeline.steps.ocr_extraction import run_ocr_extraction
from shared.config import OCRConfig, OCRQualityScoringConfig
from tests.fakes.ocr_service import create_error_ocr_service, create_mock_ocr_service

quality_scoring_config = OCRQualityScoringConfig(
    CONFIDENCE_WEIGHT=0.5, DENSITY_WEIGHT=0.5, TARGET_CHARS_PER_PAGE=10
)


@pytest.mark.ci_integration
def test_docling_ocr_service_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    config = OCRConfig(
        PROVIDER="docling",
        QUALITY_THRESHOLD=0.5,
        QUALITY_SCORING=quality_scoring_config,
    )
    adapter = create_ocr_service(config=config, log=structlog.get_logger())
    assert isinstance(adapter, OCRService)
    assert isinstance(adapter, DoclingAdapter)


@pytest.mark.ci_integration
def test_tesseract_ocr_service_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    config = OCRConfig(
        PROVIDER="tesseract",
        QUALITY_THRESHOLD=0.5,
        QUALITY_SCORING=quality_scoring_config,
    )
    adapter = create_ocr_service(config=config, log=structlog.get_logger())
    assert isinstance(adapter, OCRService)
    assert isinstance(adapter, TesseractAdapter)


@pytest.mark.ci_integration
def test_unknown_ocr_service_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    config = OCRConfig(
        PROVIDER="unknown",
        QUALITY_THRESHOLD=0.5,
        QUALITY_SCORING=quality_scoring_config,
    )
    with pytest.raises(ValueError) as exc_info:
        create_ocr_service(config=config, log=structlog.get_logger())
    assert str(exc_info.value) == "unknown is not a supported OCR Provider"


@pytest.mark.ci_integration
def test_zero_page_document_extraction() -> None:
    mocked_ocr_service = create_mock_ocr_service(
        OCRResult(
            text_per_page=[], confidence_per_page=[], extraction_method="", page_count=0
        )
    )

    result = run_ocr_extraction(
        file_path="test_file.pdf",
        ocr_service=mocked_ocr_service,
        log=structlog.get_logger(),
    )

    assert result.step_status == "completed"
    assert result.text_per_page == []
    assert len(result.document_flags) == 1
    assert result.document_flags[0].type == "extraction_failure"
    assert result.document_flags[0].reason == "Document opened but contains zero pages"


@pytest.mark.ci_integration
def test_empty_pages_extraction() -> None:
    mocked_ocr_service = create_mock_ocr_service(
        OCRResult(
            text_per_page=[""],
            confidence_per_page=[],
            extraction_method="",
            page_count=1,
        )
    )

    result = run_ocr_extraction(
        file_path="test_file.pdf",
        ocr_service=mocked_ocr_service,
        log=structlog.get_logger(),
    )

    assert result.step_status == "completed"
    assert result.text_per_page == [""]
    assert len(result.document_flags) == 1
    assert result.document_flags[0].type == "extraction_failure"
    assert result.document_flags[0].reason == "No extractable text from any page"


@pytest.mark.ci_integration
def test_empty_partial_extraction() -> None:
    mocked_ocr_service = create_mock_ocr_service(
        OCRResult(
            text_per_page=["", "some content", "", "some more content"],
            confidence_per_page=[],
            extraction_method="",
            page_count=4,
        )
    )

    result = run_ocr_extraction(
        file_path="test_file.pdf",
        ocr_service=mocked_ocr_service,
        log=structlog.get_logger(),
    )

    assert result.step_status == "completed"
    assert result.text_per_page == ["", "some content", "", "some more content"]
    assert len(result.document_flags) == 1
    assert result.document_flags[0].type == "partial_extraction"
    assert result.document_flags[0].reason == "Pages [1, 3] returned no text"


@pytest.mark.ci_integration
def test_file_open_error() -> None:
    mocked_ocr_service = create_error_ocr_service(
        FileOpenError(file_path="test_file.pdf")
    )

    result = run_ocr_extraction(
        file_path="test_file.pdf",
        ocr_service=mocked_ocr_service,
        log=structlog.get_logger(),
    )

    assert result.step_status == "failed"
    assert result.error_message == "error opening file"
    assert result.text_per_page == []
    assert len(result.document_flags) == 0


@pytest.mark.ci_integration
def test_complete_extraction() -> None:
    mocked_ocr_service = create_mock_ocr_service(
        OCRResult(
            text_per_page=["Page 1 has content"],
            confidence_per_page=[1.0],
            extraction_method="",
            page_count=1,
        )
    )

    result = run_ocr_extraction(
        file_path="test_file.pdf",
        ocr_service=mocked_ocr_service,
        log=structlog.get_logger(),
    )

    assert result.step_status == "completed"
    assert result.text_per_page == ["Page 1 has content"]
    assert len(result.document_flags) == 0
