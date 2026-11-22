"""TesseractAdapter — fallback OCR implementation (ADR-011).

Handles image files only (PNG, JPEG, TIFF). Multi-frame TIFFs are treated as
multi-page documents. Per-page confidence is the mean Tesseract word confidence
scaled from 0–100 to the 0–1 range the quality scorer expects.

Requires the ``tesseract`` binary on the host (``apt install tesseract-ocr``).
"""

from pathlib import Path

import pytesseract
import structlog
from PIL import Image, ImageSequence, UnidentifiedImageError

from pipeline.interfaces.ocr_service import FileOpenError, OCRResult, OCRService
from shared.config import OCRConfig

_SUPPORTED_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "tif", "tiff"})
_DEFAULT_LANGUAGE = "eng"

# (block, paragraph, line) identifies a line of text in Tesseract's word data.
_LineKey = tuple[int, int, int]


class TesseractAdapter(OCRService):
    def __init__(
        self,
        config: OCRConfig,
        log: structlog.BoundLogger,
        language: str = _DEFAULT_LANGUAGE,
    ) -> None:
        self.config = config
        self.log = log.bind(service="tesseract_ocr")
        self._language = language

    def extract_text(self, file_path: str) -> OCRResult:
        path = Path(file_path)
        if not path.is_file():
            self.log.error("file not found", file_path=file_path)
            raise FileOpenError(file_path)
        if not self.supports_file_type(path.suffix):
            self.log.error(
                "unsupported file type for tesseract",
                file_path=file_path,
                extension=path.suffix,
            )
            raise FileOpenError(file_path)

        text_per_page: list[str] = []
        confidence_per_page: list[float] = []
        try:
            with Image.open(path) as image:
                for frame in ImageSequence.Iterator(image):
                    text, confidence = self._read_page(frame.convert("RGB"))
                    text_per_page.append(text)
                    confidence_per_page.append(confidence)
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
            self.log.error(
                "tesseract could not open image",
                file_path=file_path,
                error=str(exc),
            )
            raise FileOpenError(file_path) from exc

        self.log.info(
            "tesseract extraction complete",
            file_path=file_path,
            page_count=len(text_per_page),
        )
        return OCRResult(
            text_per_page=text_per_page,
            confidence_per_page=confidence_per_page,
            extraction_method="tesseract",
            page_count=len(text_per_page),
        )

    def supports_file_type(self, file_extension: str) -> bool:
        return file_extension.lstrip(".").lower() in _SUPPORTED_EXTENSIONS

    def _read_page(self, image: Image.Image) -> tuple[str, float]:
        """OCR one page image and return ``(text, confidence)``, confidence in 0–1."""
        data = pytesseract.image_to_data(
            image, lang=self._language, output_type=pytesseract.Output.DICT
        )

        # Paragraph -> line -> words, preserving Tesseract's reading order.
        paragraphs: dict[tuple[int, int], dict[_LineKey, list[str]]] = {}
        confidences: list[float] = []
        for i, raw_word in enumerate(data["text"]):
            word = str(raw_word).strip()
            confidence = float(data["conf"][i])
            # Tesseract reports conf -1 for layout rows that are not words.
            if word == "" or confidence < 0:
                continue
            block, par, line = (
                int(data["block_num"][i]),
                int(data["par_num"][i]),
                int(data["line_num"][i]),
            )
            paragraphs.setdefault((block, par), {}).setdefault(
                (block, par, line), []
            ).append(word)
            confidences.append(confidence)

        if not confidences:
            return "", 0.0

        text = "\n\n".join(
            "\n".join(" ".join(words) for words in lines.values())
            for lines in paragraphs.values()
        )
        mean_confidence = sum(confidences) / len(confidences) / 100
        return text, min(max(mean_confidence, 0.0), 1.0)
