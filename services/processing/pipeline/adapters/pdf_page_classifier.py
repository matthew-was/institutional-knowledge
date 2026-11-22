"""Classify PDF pages as digital (real text) or scanned (needs OCR).

OCR is the wrong tool for a page that already carries real text: it is slower and
loses words on drawings and tables, while the PDF's own text is exact. It is the
right tool for a scan, whose embedded text layer, where there is one, comes from an
earlier OCR pass and was found to have scrambled reading order and misread words.

The distinguishing signal is the text *render mode*. An OCR layer laid over a
scanned image is stored as invisible text (mode 3) so it can be searched but not
seen; text that is part of the page's visible content uses a visible mode. This
separated every page of a real archive sample correctly, including a Canva-designed
PDF whose real text sits over page-sized background images, which an
"is there a big image" test would have wrongly treated as a scan.
"""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw

# PDF text render modes that draw something: fill, stroke, fill + stroke.
_VISIBLE_RENDER_MODES = frozenset({0, 1, 2})

# A page whose only visible text is a watermark or stamp (a handful of text runs)
# on top of a page-sized image is a scan, not a digital page.
_MIN_VISIBLE_TEXT_OBJECTS = 5
_PAGE_IMAGE_AREA_RATIO = 0.6


class PageKind(Enum):
    DIGITAL = "digital"
    SCANNED = "scanned"


@dataclass(frozen=True)
class PageRun:
    """A contiguous run of pages of one kind; page numbers are 1-based, inclusive."""

    kind: PageKind
    first_page: int
    last_page: int


def classify_pdf_pages(path: Path) -> list[PageKind]:
    """Return the kind of every page of the PDF, in page order.

    Raises ``pdfium.PdfiumError`` if the file cannot be opened as a PDF.
    """
    pdf = pdfium.PdfDocument(str(path))
    try:
        return [_classify_page(pdf[index]) for index in range(len(pdf))]
    finally:
        pdf.close()


def group_into_runs(kinds: list[PageKind]) -> list[PageRun]:
    """Collapse per-page kinds into contiguous runs, e.g. D D S D -> [D1-2, S3, D4]."""
    runs: list[PageRun] = []
    for page_number, kind in enumerate(kinds, start=1):
        if runs and runs[-1].kind is kind:
            runs[-1] = PageRun(kind, runs[-1].first_page, page_number)
        else:
            runs.append(PageRun(kind, page_number, page_number))
    return runs


def _classify_page(page: pdfium.PdfPage) -> PageKind:
    width, height = page.get_size()
    page_area = width * height

    visible_text_objects = 0
    largest_image_ratio = 0.0
    for page_object in page.get_objects(
        filter=[pdfium_raw.FPDF_PAGEOBJ_TEXT, pdfium_raw.FPDF_PAGEOBJ_IMAGE]
    ):
        if page_object.type == pdfium_raw.FPDF_PAGEOBJ_IMAGE:
            left, bottom, right, top = page_object.get_bounds()
            if page_area > 0:
                image_area = max(0.0, right - left) * max(0.0, top - bottom)
                largest_image_ratio = max(largest_image_ratio, image_area / page_area)
        elif (
            pdfium_raw.FPDFTextObj_GetTextRenderMode(page_object.raw)
            in _VISIBLE_RENDER_MODES
        ):
            visible_text_objects += 1

    if visible_text_objects == 0:
        return PageKind.SCANNED
    if (
        visible_text_objects < _MIN_VISIBLE_TEXT_OBJECTS
        and largest_image_ratio >= _PAGE_IMAGE_AREA_RATIO
    ):
        return PageKind.SCANNED
    return PageKind.DIGITAL
