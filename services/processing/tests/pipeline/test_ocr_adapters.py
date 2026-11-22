"""Unit tests for the Tesseract OCR adapter.

Tesseract is exercised through a patched ``pytesseract.image_to_data``, so these
tests need no Tesseract binary and no network. The Docling adapter has its own
tests in ``test_docling_adapter.py``; real-engine tests live in
``test_ocr_adapters_integration.py``.
"""

from pathlib import Path

import pytest
import structlog
from PIL import Image

from pipeline.adapters.tesseract_ocr import TesseractAdapter
from pipeline.interfaces.ocr_service import FileOpenError
from shared.config import OCRConfig, OCRQualityScoringConfig

_CONFIG = OCRConfig(
    PROVIDER="docling",
    QUALITY_THRESHOLD=60.0,
    QUALITY_SCORING=OCRQualityScoringConfig(
        CONFIDENCE_WEIGHT=0.7, DENSITY_WEIGHT=0.3, TARGET_CHARS_PER_PAGE=1800
    ),
)
_LOG = structlog.get_logger()


@pytest.fixture
def document_file(tmp_path: Path) -> Path:
    path = tmp_path / "scan.pdf"
    path.write_bytes(b"%PDF-1.4 placeholder")
    return path


# --------------------------------------------------------------------------- #
# TesseractAdapter
# --------------------------------------------------------------------------- #


def _word_data(
    rows: list[tuple[str, float, int, int, int]],
) -> dict[str, list[object]]:
    """Build a pytesseract DICT result from (text, conf, block, par, line) rows."""
    return {
        "text": [r[0] for r in rows],
        "conf": [r[1] for r in rows],
        "block_num": [r[2] for r in rows],
        "par_num": [r[3] for r in rows],
        "line_num": [r[4] for r in rows],
    }


@pytest.fixture
def fake_tesseract(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, list[object]]]:
    """Patch image_to_data to replay queued pages; returns the queue to fill."""
    queue: list[dict[str, list[object]]] = []

    def fake_image_to_data(
        image: Image.Image, lang: str, output_type: str
    ) -> dict[str, list[object]]:
        return queue.pop(0)

    monkeypatch.setattr("pytesseract.image_to_data", fake_image_to_data)
    return queue


def _tesseract_adapter() -> TesseractAdapter:
    return TesseractAdapter(config=_CONFIG, log=_LOG)


def _save_png(path: Path) -> Path:
    Image.new("RGB", (40, 20), "white").save(path)
    return path


def test_tesseract_rebuilds_lines_and_paragraphs_with_mean_confidence(
    tmp_path: Path, fake_tesseract: list[dict[str, list[object]]]
) -> None:
    fake_tesseract.append(
        _word_data(
            [
                ("", -1, 1, 0, 0),  # layout row, not a word
                ("Dear", 90, 1, 1, 1),
                ("Sir,", 80, 1, 1, 1),
                ("Re:", 70, 1, 2, 1),
                ("the", 100, 1, 2, 1),
                ("meadow", 60, 1, 2, 2),
            ]
        )
    )
    image = _save_png(tmp_path / "letter.png")

    ocr = _tesseract_adapter().extract_text(str(image))

    assert ocr.text_per_page == ["Dear Sir,\n\nRe: the\nmeadow"]
    assert ocr.confidence_per_page == [pytest.approx(0.8)]
    assert ocr.page_count == 1
    assert ocr.extraction_method == "tesseract"


def test_tesseract_page_with_no_words_gives_empty_text_and_zero_confidence(
    tmp_path: Path, fake_tesseract: list[dict[str, list[object]]]
) -> None:
    fake_tesseract.append(_word_data([("", -1, 1, 0, 0), ("  ", 5, 1, 1, 1)]))
    image = _save_png(tmp_path / "blank.png")

    ocr = _tesseract_adapter().extract_text(str(image))

    assert ocr.text_per_page == [""]
    assert ocr.confidence_per_page == [0.0]


def test_tesseract_multi_frame_tiff_becomes_one_page_per_frame(
    tmp_path: Path, fake_tesseract: list[dict[str, list[object]]]
) -> None:
    fake_tesseract.append(_word_data([("first", 100, 1, 1, 1)]))
    fake_tesseract.append(_word_data([("second", 50, 1, 1, 1)]))
    tiff = tmp_path / "two-pages.tiff"
    frames = [Image.new("RGB", (30, 30), "white") for _ in range(2)]
    frames[0].save(tiff, save_all=True, append_images=frames[1:])

    ocr = _tesseract_adapter().extract_text(str(tiff))

    assert ocr.text_per_page == ["first", "second"]
    assert ocr.confidence_per_page == [pytest.approx(1.0), pytest.approx(0.5)]
    assert ocr.page_count == 2


def test_tesseract_missing_file_raises_file_open_error(tmp_path: Path) -> None:
    missing = tmp_path / "nope.png"

    with pytest.raises(FileOpenError) as exc_info:
        _tesseract_adapter().extract_text(str(missing))

    assert exc_info.value.file_path == str(missing)


def test_tesseract_unsupported_extension_raises_file_open_error(
    document_file: Path,
) -> None:
    with pytest.raises(FileOpenError):
        _tesseract_adapter().extract_text(str(document_file))


def test_tesseract_corrupt_image_raises_file_open_error(tmp_path: Path) -> None:
    broken = tmp_path / "broken.png"
    broken.write_bytes(b"this is not a png")

    with pytest.raises(FileOpenError) as exc_info:
        _tesseract_adapter().extract_text(str(broken))

    assert exc_info.value.file_path == str(broken)


@pytest.mark.parametrize(
    ("extension", "expected"),
    [
        ("png", True),
        (".JPG", True),
        ("jpeg", True),
        ("tif", True),
        ("tiff", True),
        ("pdf", False),
        ("", False),
    ],
)
def test_tesseract_supports_file_type(extension: str, expected: bool) -> None:
    assert _tesseract_adapter().supports_file_type(extension) is expected
