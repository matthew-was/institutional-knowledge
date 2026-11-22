"""Build tiny but genuine PDFs of each page kind the OCR router must tell apart.

The files are valid PDFs written by hand, so tests can exercise the real page
classifier (pypdfium2) without committing binary fixtures or private documents.
"""

from collections.abc import Sequence
from pathlib import Path
from typing import Literal

PageSpec = Literal["digital", "ocr_layer", "image_only", "watermark", "designed"]
"""What a page looks like to the classifier:

digital     visible text only                                  -> digital
ocr_layer   page-sized image + invisible text (an OCR'd scan)  -> scanned
image_only  page-sized image, no text (a raw scan)             -> scanned
watermark   page-sized image + two visible text runs           -> scanned
designed    page-sized image behind many visible text runs     -> digital
            (a Canva-style PDF: real text over a background picture)
"""

_PAGE_WIDTH = 595
_PAGE_HEIGHT = 842
_DEFAULT_LINES = tuple(f"Line {n} of ordinary page text." for n in range(1, 7))
# PDF text render modes: 0 draws the glyphs, 3 draws nothing (an OCR text layer).
_VISIBLE = 0
_INVISIBLE = 3


def build_pdf(
    path: Path,
    pages: Sequence[PageSpec],
    lines: Sequence[str] = _DEFAULT_LINES,
) -> Path:
    """Write a PDF with one page per entry in ``pages`` and return ``path``.

    ``lines`` are the text runs drawn on pages that have text; each is a separate
    run, which is how the classifier counts text objects. Text is written as
    Latin-1, so characters such as ``£`` are valid.
    """
    page_objects: list[bytes] = []
    content_objects: list[bytes] = []
    for index, spec in enumerate(pages):
        content = _page_content(spec, lines)
        content_number = 6 + 2 * index
        page_objects.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Contents %d 0 R "
            b"/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> >>"
            % (_PAGE_WIDTH, _PAGE_HEIGHT, content_number)
        )
        content_objects.append(
            b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream"
        )

    kids = " ".join(f"{5 + 2 * index} 0 R" for index in range(len(pages))).encode()
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(pages),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
        b"/Encoding /WinAnsiEncoding >>",
        # A 1x1 grey pixel; drawn stretched across the page it stands in for a scan.
        b"<< /Type /XObject /Subtype /Image /Width 1 /Height 1 "
        b"/ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\n"
        b"stream\n\xe0\nendstream",
    ]
    for page_object, content_object in zip(page_objects, content_objects, strict=True):
        objects.append(page_object)
        objects.append(content_object)

    out = b"%PDF-1.4\n"
    offsets: list[int] = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref_at = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref_at,
    )
    path.write_bytes(out)
    return path


def _page_content(spec: PageSpec, lines: Sequence[str]) -> bytes:
    draw_image = b"q %d 0 0 %d 0 0 cm /Im1 Do Q\n" % (_PAGE_WIDTH, _PAGE_HEIGHT)
    if spec == "digital":
        return _text_runs(lines, _VISIBLE)
    if spec == "ocr_layer":
        return draw_image + _text_runs(lines, _INVISIBLE)
    if spec == "image_only":
        return draw_image
    if spec == "watermark":
        return draw_image + _text_runs(lines[:2], _VISIBLE)
    return draw_image + _text_runs(lines, _VISIBLE)


def _text_runs(lines: Sequence[str], render_mode: int) -> bytes:
    runs = []
    for number, line in enumerate(lines):
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        runs.append(
            f"BT {render_mode} Tr /F1 11 Tf 72 {760 - 18 * number} Td ({escaped}) Tj ET"
        )
    return "\n".join(runs).encode("latin-1")
