"""Unit tests for DoclingAdapter's page routing and result handling.

Docling itself is replaced by stand-in converters injected through the adapter's
``converter_factory``; the PDFs are real (built by ``pdf_builders``) so the real
page classifier runs. No models, Tesseract binary or network are needed. Real
engine tests live in ``test_ocr_adapters_integration.py``.
"""

import math
import sys
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

import pytest
import structlog
from PIL import Image

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.pdf_page_classifier import PageKind
from pipeline.interfaces.ocr_service import FileOpenError
from shared.config import OCRConfig
from tests.pipeline.pdf_builders import PageSpec, build_pdf

D, S = PageKind.DIGITAL, PageKind.SCANNED

# Each stand-in converter stamps its kind into the text, so a test can see which
# converter produced which page, and reports a distinct confidence per kind.
_CONFIDENCE = {D: 0.9, S: 0.7}


def _config(**overrides: object) -> OCRConfig:
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
    return OCRConfig.model_validate(settings)


@dataclass
class _FakePageConfidence:
    mean_score: float


@dataclass
class _FakeConfidence:
    pages: Mapping[int, _FakePageConfidence]


@dataclass
class _FakeDocument:
    kind: PageKind
    page_numbers: list[int]
    text_template: str
    export_calls: list[tuple[int, bool]] = field(default_factory=list)

    @property
    def pages(self) -> Mapping[int, object]:
        return {number: object() for number in self.page_numbers}

    def export_to_markdown(
        self, *, page_no: int | None = None, traverse_pictures: bool = False
    ) -> str:
        assert page_no is not None
        self.export_calls.append((page_no, traverse_pictures))
        return self.text_template.format(kind=self.kind.value, page=page_no)


@dataclass
class _FakeResult:
    document: _FakeDocument
    confidence: _FakeConfidence


@dataclass
class _Harness:
    """The adapter under test plus a record of what it asked Docling to do."""

    adapter: DoclingAdapter
    # One entry per convert() call: (kind, page_range or None for "whole document").
    calls: list[tuple[PageKind, tuple[int, int] | None]]
    built: list[PageKind]
    documents: list[_FakeDocument]


def _harness(
    total_pages: int,
    *,
    config: OCRConfig | None = None,
    error_for: Mapping[PageKind, Exception] | None = None,
    scores: Mapping[PageKind, float] | None = None,
    text_template: str = "{kind}-p{page}",
    omit_confidence: bool = False,
) -> _Harness:
    calls: list[tuple[PageKind, tuple[int, int] | None]] = []
    built: list[PageKind] = []
    documents: list[_FakeDocument] = []
    confidence = {**_CONFIDENCE, **(scores or {})}

    class _FakeConverter:
        def __init__(self, kind: PageKind) -> None:
            self._kind = kind

        def convert(
            self,
            source: str,
            *,
            raises_on_error: bool = True,
            page_range: tuple[int, int] = (1, sys.maxsize),
        ) -> _FakeResult:
            whole = page_range == (1, sys.maxsize)
            calls.append((self._kind, None if whole else page_range))
            if error_for and self._kind in error_for:
                raise error_for[self._kind]
            first, last = page_range
            numbers = list(range(first, min(last, total_pages) + 1))
            document = _FakeDocument(self._kind, numbers, text_template)
            documents.append(document)
            return _FakeResult(
                document=document,
                confidence=_FakeConfidence(
                    pages={}
                    if omit_confidence
                    else {
                        n: _FakePageConfidence(confidence[self._kind]) for n in numbers
                    }
                ),
            )

    def factory(kind: PageKind) -> _FakeConverter:
        built.append(kind)
        return _FakeConverter(kind)

    adapter = DoclingAdapter(
        config=config or _config(),
        log=structlog.get_logger(),
        converter_factory=factory,
    )
    return _Harness(adapter, calls, built, documents)


def _pdf(tmp_path: Path, pages: list[PageSpec]) -> Path:
    return build_pdf(tmp_path / "doc.pdf", pages)


# --------------------------------------------------------------------------- #
# Routing
# --------------------------------------------------------------------------- #


def test_a_digital_pdf_is_read_with_the_text_layer_converter_in_one_call(
    tmp_path: Path,
) -> None:
    h = _harness(2)

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, ["digital", "designed"])))

    assert h.calls == [(D, None)]
    assert ocr.text_per_page == ["digital-p1", "digital-p2"]
    assert ocr.confidence_per_page == [0.9, 0.9]


@pytest.mark.parametrize("spec", ["ocr_layer", "image_only", "watermark"])
def test_a_scanned_pdf_is_ocrd_with_the_scan_converter_in_one_call(
    tmp_path: Path, spec: PageSpec
) -> None:
    h = _harness(1)

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, [spec])))

    assert h.calls == [(S, None)]
    assert ocr.text_per_page == ["scanned-p1"]
    assert ocr.confidence_per_page == [0.7]


def test_a_mixed_pdf_sends_each_page_to_the_right_converter_and_keeps_page_order(
    tmp_path: Path,
) -> None:
    h = _harness(5)
    pdf = _pdf(tmp_path, ["digital", "image_only", "designed", "ocr_layer", "digital"])

    ocr = h.adapter.extract_text(str(pdf))

    assert h.calls == [
        (D, (1, 1)),
        (S, (2, 2)),
        (D, (3, 3)),
        (S, (4, 4)),
        (D, (5, 5)),
    ]
    assert ocr.text_per_page == [
        "digital-p1",
        "scanned-p2",
        "digital-p3",
        "scanned-p4",
        "digital-p5",
    ]
    assert ocr.confidence_per_page == [0.9, 0.7, 0.9, 0.7, 0.9]
    assert ocr.page_count == 5


def test_neighbouring_pages_of_one_kind_are_converted_together(
    tmp_path: Path,
) -> None:
    h = _harness(5)
    pdf = _pdf(tmp_path, ["digital", "digital", "image_only", "ocr_layer", "digital"])

    h.adapter.extract_text(str(pdf))

    assert h.calls == [(D, (1, 2)), (S, (3, 4)), (D, (5, 5))]


def test_converters_are_built_lazily_once_per_kind_and_reused(
    tmp_path: Path,
) -> None:
    h = _harness(3)
    assert h.built == []  # nothing is built, and no model loaded, until needed
    pdf = _pdf(tmp_path, ["digital", "image_only", "digital"])

    h.adapter.extract_text(str(pdf))
    h.adapter.extract_text(str(pdf))

    assert h.built == [D, S]


def test_a_digital_only_pdf_never_builds_the_scan_converter(tmp_path: Path) -> None:
    """So a host without Tesseract can still read digital PDFs."""
    h = _harness(1)

    h.adapter.extract_text(str(_pdf(tmp_path, ["digital"])))

    assert h.built == [D]


# --------------------------------------------------------------------------- #
# PDF_MODE overrides
# --------------------------------------------------------------------------- #


def test_pdf_mode_ocr_forces_every_page_through_ocr(tmp_path: Path) -> None:
    h = _harness(2, config=_config(PDF_MODE="ocr"))

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, ["digital", "digital"])))

    assert h.calls == [(S, None)]
    assert ocr.text_per_page == ["scanned-p1", "scanned-p2"]


def test_pdf_mode_text_forces_every_page_to_use_the_text_layer(
    tmp_path: Path,
) -> None:
    h = _harness(2, config=_config(PDF_MODE="text"))

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, ["image_only", "ocr_layer"])))

    assert h.calls == [(D, None)]
    assert ocr.text_per_page == ["digital-p1", "digital-p2"]


@pytest.mark.parametrize("pdf_mode", ["auto", "ocr", "text"])
def test_an_image_is_always_ocrd_whatever_the_pdf_mode(
    tmp_path: Path, pdf_mode: str
) -> None:
    """Images have no text layer, so there is nothing to route."""
    h = _harness(1, config=_config(PDF_MODE=pdf_mode))
    image = tmp_path / "page.png"
    Image.new("RGB", (40, 20), "white").save(image)

    h.adapter.extract_text(str(image))

    assert h.calls == [(S, None)]


# --------------------------------------------------------------------------- #
# Result handling
# --------------------------------------------------------------------------- #


def test_text_nested_inside_pictures_is_exported(tmp_path: Path) -> None:
    """Text the layout model labels as a picture is read but dropped by default."""
    h = _harness(2)

    h.adapter.extract_text(str(_pdf(tmp_path, ["digital", "digital"])))

    assert h.documents[0].export_calls == [(1, True), (2, True)]


def test_surrounding_whitespace_is_stripped_from_page_text(tmp_path: Path) -> None:
    h = _harness(1, text_template="\n\n  {kind} text  \n")

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, ["digital"])))

    assert ocr.text_per_page == ["digital text"]


@pytest.mark.parametrize(
    ("reported", "expected"),
    [(math.nan, 0.0), (-0.2, 0.0), (1.7, 1.0), (0.42, 0.42)],
)
def test_confidence_is_sanitised_to_the_unit_range(
    tmp_path: Path, reported: float, expected: float
) -> None:
    """NaN must never reach the scorer: ``NaN < threshold`` is False, so an unknown
    page would silently pass the quality gate."""
    h = _harness(1, scores={D: reported})

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, ["digital"])))

    assert ocr.confidence_per_page == [expected]


def test_a_page_without_a_confidence_entry_gets_zero_confidence(
    tmp_path: Path,
) -> None:
    h = _harness(2, omit_confidence=True)

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, ["digital", "digital"])))

    assert ocr.confidence_per_page == [0.0, 0.0]


def test_the_result_is_labelled_as_docling(tmp_path: Path) -> None:
    h = _harness(1)

    ocr = h.adapter.extract_text(str(_pdf(tmp_path, ["digital"])))

    assert ocr.extraction_method == "docling"


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


def test_a_missing_file_raises_file_open_error_without_building_converters(
    tmp_path: Path,
) -> None:
    h = _harness(1)
    missing = tmp_path / "nope.pdf"

    with pytest.raises(FileOpenError) as exc_info:
        h.adapter.extract_text(str(missing))

    assert exc_info.value.file_path == str(missing)
    assert h.built == []


def test_a_file_that_is_not_a_pdf_raises_file_open_error(tmp_path: Path) -> None:
    h = _harness(1)
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"this is not a pdf")

    with pytest.raises(FileOpenError) as exc_info:
        h.adapter.extract_text(str(broken))

    assert exc_info.value.file_path == str(broken)
    assert h.built == []


def test_a_conversion_error_raises_file_open_error(tmp_path: Path) -> None:
    from docling.exceptions import ConversionError

    h = _harness(1, error_for={D: ConversionError("corrupt pdf")})
    pdf = _pdf(tmp_path, ["digital"])

    with pytest.raises(FileOpenError) as exc_info:
        h.adapter.extract_text(str(pdf))

    assert exc_info.value.file_path == str(pdf)


def test_a_conversion_error_in_a_later_run_still_fails_the_whole_document(
    tmp_path: Path,
) -> None:
    from docling.exceptions import ConversionError

    h = _harness(2, error_for={S: ConversionError("cannot read scan")})
    pdf = _pdf(tmp_path, ["digital", "image_only"])

    with pytest.raises(FileOpenError):
        h.adapter.extract_text(str(pdf))

    assert h.calls == [(D, (1, 1)), (S, (2, 2))]


def test_an_unexpected_error_is_not_masked_as_file_open_error(
    tmp_path: Path,
) -> None:
    h = _harness(1, error_for={D: ValueError("bug in the adapter or library")})

    with pytest.raises(ValueError, match="bug in the adapter"):
        h.adapter.extract_text(str(_pdf(tmp_path, ["digital"])))


# --------------------------------------------------------------------------- #
# Supported file types
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("extension", "expected"),
    [
        ("pdf", True),
        (".PDF", True),
        ("png", True),
        ("jpg", True),
        ("jpeg", True),
        ("tif", True),
        (".tiff", True),
        ("docx", False),
        ("", False),
    ],
)
def test_supports_file_type(extension: str, expected: bool) -> None:
    adapter = DoclingAdapter(config=_config(), log=structlog.get_logger())

    assert adapter.supports_file_type(extension) is expected
