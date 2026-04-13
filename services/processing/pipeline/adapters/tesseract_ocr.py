"""TesseractAdapter — fallback OCR implementation (ADR-011)."""

import structlog

from pipeline.interfaces.ocr_service import OCRResult, OCRService
from shared.config import OCRConfig


class TesseractAdapter(OCRService):
    def __init__(self, config: OCRConfig, log: structlog.BoundLogger) -> None:
        self.config = config
        self.log = log.bind(service="tesseract_ocr")

    def extract_text(self, file_path: str) -> OCRResult:
        raise NotImplementedError

    def supports_file_type(self, file_extension: str) -> bool:
        return file_extension.lower() in {"png", "jpg", "tiff", "jpeg"}
