"""Integration tests: run the real OCR engines on generated sample documents.

Local only (``-m integration``). The Docling tests need Docling's layout and OCR
model weights, which are downloaded on first use, and the ``tesseract`` binary
(``sudo apt install tesseract-ocr``), which scanned pages use by default. The
standalone Tesseract test is skipped without the binary. Pages are generated with
Pillow and hand-built PDFs, so no fixture files are committed.
"""

import shutil
from pathlib import Path

import pypdfium2 as pdfium
import pytest
import structlog
from PIL import Image, ImageDraw, ImageFont

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.tesseract_ocr import TesseractAdapter
from shared.config import OCRConfig, OCRQualityScoringConfig
from tests.pipeline.pdf_builders import build_pdf

pytestmark = pytest.mark.integration

_CONFIG = OCRConfig(
    PROVIDER="docling",
    QUALITY_THRESHOLD=60.0,
    QUALITY_SCORING=OCRQualityScoringConfig(
        CONFIDENCE_WEIGHT=0.7, DENSITY_WEIGHT=0.3, TARGET_CHARS_PER_PAGE=1800
    ),
)
_LOG = structlog.get_logger()

_SAMPLE_LINES = [
    "DEED OF CONVEYANCE",
    "",
    "This deed was made on 14 March 1974 between Harrison and Sons Ltd",
    "and Mr Arthur Whitcombe, concerning Lot 12 and 4 acres of the",
    "east meadow, together with the drainage works completed in 1974.",
]
# Distinctive words that should survive OCR on a clean, printed page.
_EXPECTED_WORDS = ["CONVEYANCE", "Harrison", "Whitcombe", "1974", "meadow"]


def _make_sample_page(path: Path) -> Path:
    """Render the sample text as a clean, printed-looking page image."""
    image = Image.new("RGB", (1240, 700), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=34)
    y = 80
    for line in _SAMPLE_LINES:
        draw.text((80, y), line, fill="black", font=font)
        y += 70
    image.save(path)
    return path


def _assert_sample_text_found(text: str) -> None:
    missing = [word for word in _EXPECTED_WORDS if word.lower() not in text.lower()]
    assert not missing, f"OCR output is missing {missing}; got: {text!r}"


def test_docling_extracts_text_from_image(tmp_path: Path) -> None:
    sample = _make_sample_page(tmp_path / "sample.png")

    ocr = DoclingAdapter(config=_CONFIG, log=_LOG).extract_text(str(sample))

    assert ocr.page_count == 1
    assert ocr.extraction_method == "docling"
    assert 0.0 < ocr.confidence_per_page[0] <= 1.0
    _assert_sample_text_found(ocr.text_per_page[0])


@pytest.mark.parametrize("resolution", [72, 200, 300])
def test_docling_extracts_text_from_scanned_pdf(
    tmp_path: Path, resolution: int
) -> None:
    """An image-only PDF (a scan) must OCR fully at any page size.

    Regression guard: with Docling's default OCR mode, the same page lost most of
    its second line as an image-only PDF at 72 and 300 dpi, though it read fine as
    a PNG and as a 200 dpi PDF. Reading scans as whole pages fixes that.
    """
    sample = _make_sample_page(tmp_path / "sample.png")
    pdf = tmp_path / "sample.pdf"
    Image.open(sample).save(pdf, resolution=resolution)

    ocr = DoclingAdapter(config=_CONFIG, log=_LOG).extract_text(str(pdf))

    assert ocr.page_count == 1
    assert 0.0 < ocr.confidence_per_page[0] <= 1.0
    _assert_sample_text_found(ocr.text_per_page[0])


@pytest.mark.skipif(
    shutil.which("tesseract") is None, reason="tesseract binary not installed"
)
def test_tesseract_extracts_text_from_image(tmp_path: Path) -> None:
    sample = _make_sample_page(tmp_path / "sample.png")

    ocr = TesseractAdapter(config=_CONFIG, log=_LOG).extract_text(str(sample))

    assert ocr.page_count == 1
    assert ocr.extraction_method == "tesseract"
    assert 0.5 < ocr.confidence_per_page[0] <= 1.0
    _assert_sample_text_found(ocr.text_per_page[0])


# Lines with the tokens OCR most often damages: a currency sign, long digit runs,
# punctuated reference numbers, and the 0/O and 1/l look-alikes.
_DIGITAL_LINES = [
    "Ref: INV-2024-0017 / Account 40 5081",
    "Dear Mr Whitcombe,",
    "Invoice for the east meadow drainage works completed on 14 March 2024.",
    "Total due: GBP \u00a33,412.50 (including VAT at 20%). Please pay within 30 days.",
    "Bank details: sort code 20-45-67, account number 10293847, reference O1l0.",
    "Yours sincerely, Alice Harrison",
]
_DIGITAL_TOKENS = [
    "INV-2024-0017",
    "40 5081",
    "\u00a33,412.50",
    "20-45-67",
    "10293847",
    "O1l0",
    "Whitcombe",
]


def _assert_digital_text_exact(text: str) -> None:
    missing = [token for token in _DIGITAL_TOKENS if token not in text]
    assert not missing, f"digital text is missing {missing}; got: {text!r}"
    assert "<!-- image -->" not in text


def test_docling_reads_a_digital_pdf_exactly_without_ocr_errors(
    tmp_path: Path,
) -> None:
    """A digital page's own text is exact; OCR would risk 0/O and 1/l swaps and
    lose drawings and tables. The router must take the text layer."""
    pdf = build_pdf(tmp_path / "digital.pdf", ["digital"], lines=_DIGITAL_LINES)

    ocr = DoclingAdapter(config=_CONFIG, log=_LOG).extract_text(str(pdf))

    assert ocr.page_count == 1
    _assert_digital_text_exact(ocr.text_per_page[0])


def test_docling_routes_a_mixed_document_and_keeps_page_order(
    tmp_path: Path,
) -> None:
    """Digital, scanned, digital: each page takes its own route and the merged
    result is back in page order."""
    digital = build_pdf(
        tmp_path / "digital.pdf", ["digital", "digital"], lines=_DIGITAL_LINES
    )
    sample = _make_sample_page(tmp_path / "sample.png")
    scan = tmp_path / "scan.pdf"
    Image.open(sample).save(scan, resolution=200)

    mixed = pdfium.PdfDocument.new()
    digital_pdf, scan_pdf = (
        pdfium.PdfDocument(str(digital)),
        pdfium.PdfDocument(str(scan)),
    )
    mixed.import_pages(digital_pdf, [0])
    mixed.import_pages(scan_pdf, [0])
    mixed.import_pages(digital_pdf, [1])
    mixed_path = tmp_path / "mixed.pdf"
    mixed.save(str(mixed_path))

    ocr = DoclingAdapter(config=_CONFIG, log=_LOG).extract_text(str(mixed_path))

    assert ocr.page_count == 3
    _assert_digital_text_exact(ocr.text_per_page[0])
    _assert_sample_text_found(ocr.text_per_page[1])
    _assert_digital_text_exact(ocr.text_per_page[2])
