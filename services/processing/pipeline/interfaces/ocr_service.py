"""OCRService abstract base class (ADR-011)."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class OCRResult:
    text_per_page: list[str]
    confidence_per_page: list[float]
    extraction_method: str
    page_count: int


class OCRService(ABC):
    @abstractmethod
    def extract_text(self, file_path: str) -> OCRResult: ...

    @abstractmethod
    def supports_file_type(self, file_extension: str) -> bool: ...
