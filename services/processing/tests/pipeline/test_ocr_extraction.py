import pytest
import structlog

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.tesseract_ocr import TesseractAdapter
from pipeline.factories.ocr_factory import create_ocr_service
from pipeline.interfaces.ocr_service import OCRService
from shared.config import config


@pytest.mark.ci_integration
def test_docling_ocr_service_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.PROCESSING.OCR, "PROVIDER", "docling")
    adapter = create_ocr_service(config=config, log=structlog.get_logger())
    assert isinstance(adapter, OCRService)
    assert isinstance(adapter, DoclingAdapter)


@pytest.mark.ci_integration
def test_tesseract_ocr_service_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.PROCESSING.OCR, "PROVIDER", "tesseract")
    adapter = create_ocr_service(config=config, log=structlog.get_logger())
    assert isinstance(adapter, OCRService)
    assert isinstance(adapter, TesseractAdapter)


@pytest.mark.ci_integration
def test_unknown_ocr_service_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.PROCESSING.OCR, "PROVIDER", "unknown")
    with pytest.raises(ValueError) as exc_info:
        create_ocr_service(config=config, log=structlog.get_logger())
    assert str(exc_info.value) == "unknown is not a supported OCR Provider"
