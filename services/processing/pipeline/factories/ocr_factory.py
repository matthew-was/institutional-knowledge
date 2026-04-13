"""OCR service factory — selects adapter from config (ADR-011)."""

import structlog

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.tesseract_ocr import TesseractAdapter
from pipeline.interfaces.ocr_service import OCRService
from shared.config import OCRConfig


def create_ocr_service(config: OCRConfig, log: structlog.BoundLogger) -> OCRService:
    if config.PROVIDER == "docling":
        return DoclingAdapter(config=config, log=log)

    if config.PROVIDER == "tesseract":
        return TesseractAdapter(config=config, log=log)

    raise ValueError(f"{config.PROVIDER} is not a supported OCR Provider")
