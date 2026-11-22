"""The configuration must reach Docling: device, OCR engine and OCR mode, per page kind.

``DocumentConverter`` is replaced by a recorder, so nothing is loaded and no model
is downloaded; the options the adapter builds are inspected instead.
"""

import pytest
import structlog
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    OcrAutoOptions,
    OcrMode,
    PdfPipelineOptions,
    TesseractCliOcrOptions,
)

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.pdf_page_classifier import PageKind
from shared.config import OCRConfig

D, S = PageKind.DIGITAL, PageKind.SCANNED


class _RecordingConverter:
    """Stands in for docling's DocumentConverter and records how it was built."""

    instances: list["_RecordingConverter"] = []

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        _RecordingConverter.instances.append(self)


@pytest.fixture(autouse=True)
def _patch_document_converter(monkeypatch: pytest.MonkeyPatch) -> None:
    _RecordingConverter.instances.clear()
    monkeypatch.setattr(
        "docling.document_converter.DocumentConverter", _RecordingConverter
    )
    # Pretend the tesseract binary exists unless a test says otherwise.
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")


def _adapter(**overrides: object) -> DoclingAdapter:
    settings: dict[str, object] = {
        "PROVIDER": "docling",
        "QUALITY_THRESHOLD": 60.0,
        "QUALITY_SCORING": {
            "CONFIDENCE_WEIGHT": 0.7,
            "DENSITY_WEIGHT": 0.3,
            "TARGET_CHARS_PER_PAGE": 1800,
        },
        **overrides,
    }
    return DoclingAdapter(
        config=OCRConfig.model_validate(settings), log=structlog.get_logger()
    )


def _build(kind: PageKind, **overrides: object) -> _RecordingConverter:
    _adapter(**overrides)._build_converter(kind)
    (converter,) = _RecordingConverter.instances
    return converter


def _pipeline_options(
    converter: _RecordingConverter, input_format: InputFormat
) -> PdfPipelineOptions:
    format_options = converter.kwargs["format_options"]
    assert isinstance(format_options, dict)
    options = format_options[input_format].pipeline_options
    assert isinstance(options, PdfPipelineOptions)
    return options


@pytest.mark.parametrize("kind", [D, S])
@pytest.mark.parametrize("device", ["cuda:1", "cpu", "auto"])
def test_configured_device_is_applied_to_pdf_and_image_pipelines(
    kind: PageKind, device: str
) -> None:
    converter = _build(kind, DEVICE=device)

    for input_format in (InputFormat.PDF, InputFormat.IMAGE):
        options = _pipeline_options(converter, input_format)
        assert str(options.accelerator_options.device) == device


def test_device_defaults_to_auto() -> None:
    converter = _build(S)

    options = _pipeline_options(converter, InputFormat.PDF)
    assert str(options.accelerator_options.device) == "auto"


def test_scans_use_tesseract_on_the_whole_page_by_default() -> None:
    converter = _build(S)

    for input_format in (InputFormat.PDF, InputFormat.IMAGE):
        ocr = _pipeline_options(converter, input_format).ocr_options
        assert isinstance(ocr, TesseractCliOcrOptions)
        assert ocr.mode is OcrMode.FULL_PAGE
        assert ocr.lang == ["eng"]


def test_scans_use_doclings_own_engine_when_engine_is_auto() -> None:
    converter = _build(S, ENGINE="auto")

    ocr = _pipeline_options(converter, InputFormat.PDF).ocr_options
    assert isinstance(ocr, OcrAutoOptions)
    assert ocr.mode is OcrMode.FULL_PAGE


@pytest.mark.parametrize("engine", ["tesseract", "auto"])
def test_digital_pages_read_their_own_text_whatever_the_engine(engine: str) -> None:
    """OCR runs only on bitmaps embedded in a digital page, never the whole page."""
    converter = _build(D, ENGINE=engine)

    for input_format in (InputFormat.PDF, InputFormat.IMAGE):
        ocr = _pipeline_options(converter, input_format).ocr_options
        assert isinstance(ocr, OcrAutoOptions)
        assert ocr.mode is OcrMode.DEFAULT


def test_missing_tesseract_binary_fails_scans_with_an_actionable_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("shutil.which", lambda name: None)

    with pytest.raises(RuntimeError, match=r"tesseract.*ENGINE"):
        _adapter()._build_converter(S)


def test_missing_tesseract_binary_does_not_stop_digital_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("shutil.which", lambda name: None)

    converter = _build(D)

    assert converter is _RecordingConverter.instances[0]


def test_missing_tesseract_binary_does_not_stop_the_auto_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("shutil.which", lambda name: None)

    _build(S, ENGINE="auto")

    assert len(_RecordingConverter.instances) == 1


@pytest.mark.parametrize("kind", [D, S])
def test_converters_accept_only_pdf_and_image_formats(kind: PageKind) -> None:
    converter = _build(kind)

    assert converter.kwargs["allowed_formats"] == [InputFormat.PDF, InputFormat.IMAGE]
