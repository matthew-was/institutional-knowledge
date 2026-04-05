"""OCR extraction pipeline step (ADR-011)."""

from dataclasses import dataclass
from typing import Literal

import structlog

from pipeline.interfaces.ocr_service import (
    FileOpenError,
    OCRResult,
    OCRService,
)
from pipeline.interfaces.pipeline_models import DocumentFlag


@dataclass
class ExtractionResult:
    text_per_page: list[str]
    confidence_per_page: list[float]
    extraction_method: str
    page_count: int
    document_flags: list[DocumentFlag]
    step_status: Literal["completed", "failed"]
    error_message: str | None


def extraction_result_builder(
    step_status: Literal["completed", "failed"],
    document_flags: list[DocumentFlag],
    error_message: str | None,
    data: OCRResult | None,
) -> ExtractionResult:
    if data is not None:
        return ExtractionResult(
            text_per_page=data.text_per_page,
            confidence_per_page=data.confidence_per_page,
            extraction_method=data.extraction_method,
            page_count=data.page_count,
            document_flags=document_flags,
            step_status=step_status,
            error_message=error_message,
        )

    return ExtractionResult(
        text_per_page=[],
        confidence_per_page=[],
        extraction_method="",
        page_count=0,
        document_flags=document_flags,
        step_status=step_status,
        error_message=error_message,
    )


def run_ocr_extraction(
    file_path: str, ocr_service: OCRService, log: structlog.BoundLogger
) -> ExtractionResult:
    try:
        ocr_result = ocr_service.extract_text(file_path=file_path)

        if len(ocr_result.text_per_page) == 0:
            log.warning("Document contained 0 pages", file_path=file_path)
            return extraction_result_builder(
                step_status="completed",
                document_flags=[
                    DocumentFlag(
                        type="extraction_failure",
                        reason="Document opened but contains zero pages",
                    )
                ],
                error_message=None,
                data=None,
            )

        if all(s.strip() == "" for s in ocr_result.text_per_page):
            log.warning("All document pages were empty", file_path=file_path)
            return extraction_result_builder(
                step_status="completed",
                document_flags=[
                    DocumentFlag(
                        type="extraction_failure",
                        reason="No extractable text from any page",
                    )
                ],
                error_message=None,
                data=ocr_result,
            )

        if any(s.strip() == "" for s in ocr_result.text_per_page):
            empty_pages: list[int] = []
            for idx, value in enumerate(ocr_result.text_per_page):
                if value.strip() == "":
                    empty_pages.append(idx + 1)

            log.warning(
                "Some document pages were empty",
                file_path=file_path,
                empty_pages=empty_pages,
            )

            return extraction_result_builder(
                step_status="completed",
                document_flags=[
                    DocumentFlag(
                        type="partial_extraction",
                        reason=f"Pages {str(empty_pages)} returned no text",
                    )
                ],
                error_message=None,
                data=ocr_result,
            )

        return extraction_result_builder(
            step_status="completed",
            document_flags=[],
            error_message=None,
            data=ocr_result,
        )

    except FileOpenError as exc_foe_info:
        log.error("Error opening file", file_path=exc_foe_info.file_path)
        return extraction_result_builder(
            step_status="failed",
            document_flags=[],
            error_message="error opening file",
            data=None,
        )
