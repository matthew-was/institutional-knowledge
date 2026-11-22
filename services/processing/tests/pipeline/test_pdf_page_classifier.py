"""The page classifier decides, per page, whether to trust the PDF's own text."""

from pathlib import Path

import pypdfium2 as pdfium
import pytest

from pipeline.adapters.pdf_page_classifier import (
    PageKind,
    PageRun,
    classify_pdf_pages,
    group_into_runs,
)
from tests.pipeline.pdf_builders import PageSpec, build_pdf

D, S = PageKind.DIGITAL, PageKind.SCANNED


@pytest.mark.parametrize(
    ("spec", "expected"),
    [
        # Visible text and nothing else: a born-digital page.
        ("digital", D),
        # An OCR'd scan stores its text invisibly over the page image. The text
        # exists but its order and spelling cannot be trusted, so re-OCR the page.
        ("ocr_layer", S),
        # A raw scan has no text at all.
        ("image_only", S),
        # A page-sized image with only a stamp or watermark of visible text is
        # still a scan; the watermark must not make it look digital.
        ("watermark", S),
        # Real text over a page-sized background picture (a Canva-style design) is
        # digital. "Is there a big image" would wrongly call this a scan.
        ("designed", D),
    ],
)
def test_page_kind_is_decided_from_visible_text(
    tmp_path: Path, spec: PageSpec, expected: PageKind
) -> None:
    pdf = build_pdf(tmp_path / "doc.pdf", [spec])

    assert classify_pdf_pages(pdf) == [expected]


def test_every_page_is_classified_independently_in_page_order(
    tmp_path: Path,
) -> None:
    pdf = build_pdf(
        tmp_path / "mixed.pdf",
        ["digital", "image_only", "designed", "ocr_layer", "digital"],
    )

    assert classify_pdf_pages(pdf) == [D, S, D, S, D]


def test_file_that_is_not_a_pdf_raises_pdfium_error(tmp_path: Path) -> None:
    not_a_pdf = tmp_path / "broken.pdf"
    not_a_pdf.write_bytes(b"this is not a pdf")

    with pytest.raises(pdfium.PdfiumError):
        classify_pdf_pages(not_a_pdf)


def test_group_into_runs_merges_neighbouring_pages_of_the_same_kind() -> None:
    assert group_into_runs([D, D, S, S, S, D]) == [
        PageRun(D, 1, 2),
        PageRun(S, 3, 5),
        PageRun(D, 6, 6),
    ]


def test_group_into_runs_keeps_alternating_pages_separate() -> None:
    assert group_into_runs([D, S, D]) == [
        PageRun(D, 1, 1),
        PageRun(S, 2, 2),
        PageRun(D, 3, 3),
    ]


def test_group_into_runs_of_a_single_kind_is_one_run() -> None:
    assert group_into_runs([S, S, S]) == [PageRun(S, 1, 3)]


def test_group_into_runs_of_no_pages_is_empty() -> None:
    assert group_into_runs([]) == []
