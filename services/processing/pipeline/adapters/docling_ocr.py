"""DoclingAdapter — primary OCR implementation (ADR-011).

Docling converts PDFs and images into a structured document model. Page text is
exported as Markdown so headings, paragraphs, lists and tables survive into the
chunking step, and Docling's per-page confidence report supplies the 0–1
confidence value the quality scorer expects.

PDF pages are routed by kind (see ``pdf_page_classifier``), because the right tool
differs. A digital page already carries exact text, which is read directly: OCR on
such pages was slower and lost most of the words on drawings and tables. A scanned
page has no trustworthy text, so the whole page is OCR'd. A document can mix both,
so each contiguous run of one kind is converted on its own and the results are put
back in page order. ``PDF_MODE`` can force either behaviour for every page.
"""

import math
import shutil
import sys
import threading
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Protocol

import pypdfium2 as pdfium
import structlog

from pipeline.adapters.pdf_page_classifier import (
    PageKind,
    PageRun,
    classify_pdf_pages,
    group_into_runs,
)
from pipeline.interfaces.ocr_service import FileOpenError, OCRResult, OCRService
from shared.config import OCRConfig

_SUPPORTED_EXTENSIONS = frozenset({"pdf", "png", "jpg", "jpeg", "tif", "tiff"})

# Used when Docling reports no usable confidence for a page (NaN or missing).
# NaN must never reach the quality scorer: ``NaN < threshold`` is False, so an
# unknown page would silently pass. Zero makes it fail the threshold and get
# flagged for review instead.
_UNKNOWN_CONFIDENCE = 0.0


class _PageConfidence(Protocol):
    @property
    def mean_score(self) -> float: ...


class _ConfidenceReport(Protocol):
    @property
    def pages(self) -> Mapping[int, _PageConfidence]: ...


class _Document(Protocol):
    @property
    def pages(self) -> Mapping[int, object]: ...

    def export_to_markdown(
        self, *, page_no: int | None = None, traverse_pictures: bool = False
    ) -> str: ...


class _ConversionResult(Protocol):
    @property
    def document(self) -> _Document: ...

    @property
    def confidence(self) -> _ConfidenceReport: ...


class _Converter(Protocol):
    def convert(
        self,
        source: str,
        *,
        raises_on_error: bool = True,
        page_range: tuple[int, int] = (1, sys.maxsize),
    ) -> _ConversionResult: ...


ConverterFactory = Callable[[PageKind], _Converter]


class DoclingAdapter(OCRService):
    def __init__(
        self,
        config: OCRConfig,
        log: structlog.BoundLogger,
        converter_factory: ConverterFactory | None = None,
    ) -> None:
        self.config = config
        self.log = log.bind(service="docling_ocr")
        # Converters load large layout/OCR models on first use, so they are built
        # lazily, one per page kind: importing this module and starting the service
        # stay cheap, and tests can inject stand-in converters.
        self._converter_factory = converter_factory or self._build_converter
        self._converters: dict[PageKind, _Converter] = {}
        # A DocumentConverter is not safe to share across concurrent conversions.
        self._lock = threading.Lock()

    def extract_text(self, file_path: str) -> OCRResult:
        from docling.exceptions import ConversionError

        path = Path(file_path)
        if not path.is_file():
            self.log.error("file not found", file_path=file_path)
            raise FileOpenError(file_path)

        runs = self._plan_runs(path, file_path)
        # Results are keyed by the original page number, which Docling preserves
        # when converting a page range, so runs can be merged back in order.
        pages: dict[int, tuple[str, float]] = {}
        with self._lock:
            for run in runs:
                converter = self._get_converter(run.kind)
                try:
                    if len(runs) == 1:
                        result = converter.convert(str(path), raises_on_error=True)
                    else:
                        result = converter.convert(
                            str(path),
                            raises_on_error=True,
                            page_range=(run.first_page, run.last_page),
                        )
                except (ConversionError, OSError) as exc:
                    self.log.error(
                        "docling could not convert file",
                        file_path=file_path,
                        pages=f"{run.first_page}-{run.last_page}",
                        error=str(exc),
                    )
                    raise FileOpenError(file_path) from exc

                document = result.document
                for page_no in sorted(document.pages):
                    # traverse_pictures: when the layout model labels a text block
                    # as a picture (stamps, letterheads, small or noisy scans),
                    # Docling still reads the text inside it, but the default
                    # export drops it. Include it so no text is silently lost.
                    text = document.export_to_markdown(
                        page_no=page_no, traverse_pictures=True
                    ).strip()
                    pages[page_no] = (
                        text,
                        self._page_confidence(result.confidence, page_no),
                    )

        ordered = [pages[page_no] for page_no in sorted(pages)]
        self.log.info(
            "docling extraction complete", file_path=file_path, page_count=len(ordered)
        )
        return OCRResult(
            text_per_page=[text for text, _ in ordered],
            confidence_per_page=[confidence for _, confidence in ordered],
            extraction_method="docling",
            page_count=len(ordered),
        )

    def supports_file_type(self, file_extension: str) -> bool:
        return file_extension.lstrip(".").lower() in _SUPPORTED_EXTENSIONS

    def _plan_runs(self, path: Path, file_path: str) -> list[PageRun]:
        """Split the document into runs of pages that need the same treatment."""
        if path.suffix.lower() != ".pdf":
            # Images have no text layer: always OCR the whole page.
            return [PageRun(PageKind.SCANNED, 1, 1)]

        try:
            kinds = classify_pdf_pages(path)
        except pdfium.PdfiumError as exc:
            self.log.error("could not open pdf", file_path=file_path, error=str(exc))
            raise FileOpenError(file_path) from exc

        mode = self.config.PDF_MODE
        if mode == "ocr":
            kinds = [PageKind.SCANNED] * len(kinds)
        elif mode == "text":
            kinds = [PageKind.DIGITAL] * len(kinds)

        self.log.info(
            "routing pdf pages",
            file_path=file_path,
            pdf_mode=mode,
            digital_pages=kinds.count(PageKind.DIGITAL),
            scanned_pages=kinds.count(PageKind.SCANNED),
        )
        return group_into_runs(kinds)

    def _get_converter(self, kind: PageKind) -> _Converter:
        if kind not in self._converters:
            self._converters[kind] = self._converter_factory(kind)
        return self._converters[kind]

    def _build_converter(self, kind: PageKind) -> _Converter:
        from docling.datamodel.accelerator_options import AcceleratorOptions
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import (
            OcrAutoOptions,
            OcrMode,
            PdfPipelineOptions,
            TesseractCliOcrOptions,
        )
        from docling.document_converter import (
            DocumentConverter,
            ImageFormatOption,
            PdfFormatOption,
        )

        device = self.config.DEVICE
        use_tesseract = kind is PageKind.SCANNED and self.config.ENGINE == "tesseract"
        if use_tesseract and shutil.which("tesseract") is None:
            raise RuntimeError(
                "OCR engine 'tesseract' is configured but the tesseract binary is "
                "not on PATH. Install it (apt install tesseract-ocr) or set "
                "PROCESSING.OCR.ENGINE to 'auto'."
            )
        # Scans need the whole page OCR'd. Digital pages use their own text, with
        # OCR only for any embedded bitmaps, whatever engine is configured.
        ocr_mode = OcrMode.FULL_PAGE if kind is PageKind.SCANNED else OcrMode.DEFAULT
        self.log.info(
            "initialising docling converter",
            page_kind=kind.value,
            device=device,
            ocr_engine="tesseract" if use_tesseract else "auto",
            ocr_mode=ocr_mode.value,
        )

        def pipeline_options() -> PdfPipelineOptions:
            if use_tesseract:
                ocr_options: TesseractCliOcrOptions | OcrAutoOptions = (
                    TesseractCliOcrOptions(mode=ocr_mode, lang=["eng"])
                )
            else:
                ocr_options = OcrAutoOptions(mode=ocr_mode)
            return PdfPipelineOptions(
                accelerator_options=AcceleratorOptions(device=device),
                ocr_options=ocr_options,
            )

        return DocumentConverter(
            allowed_formats=[InputFormat.PDF, InputFormat.IMAGE],
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options()),
                InputFormat.IMAGE: ImageFormatOption(
                    pipeline_options=pipeline_options()
                ),
            },
        )

    def _page_confidence(self, report: _ConfidenceReport, page_no: int) -> float:
        scores = report.pages.get(page_no)
        if scores is None:
            self.log.warning("no confidence reported for page", page=page_no)
            return _UNKNOWN_CONFIDENCE
        score = scores.mean_score
        if math.isnan(score):
            self.log.warning("confidence is NaN for page", page=page_no)
            return _UNKNOWN_CONFIDENCE
        return min(max(score, 0.0), 1.0)
