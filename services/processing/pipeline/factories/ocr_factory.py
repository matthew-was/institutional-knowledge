"""OCR service factory — selects adapter from config (ADR-011)."""

import structlog

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.tesseract_ocr import TesseractAdapter
from pipeline.interfaces.ocr_service import OCRService
from shared.config import AppConfig


def create_ocr_service(config: AppConfig, log: structlog.BoundLogger) -> OCRService:
    if config.PROCESSING.OCR.PROVIDER == "docling":
        return DoclingAdapter(config=config, log=log)

    if config.PROCESSING.OCR.PROVIDER == "tesseract":
        return TesseractAdapter(config=config, log=log)

    raise ValueError(
        f"{config.PROCESSING.OCR.PROVIDER} is not a supported OCR Provider"
    )
