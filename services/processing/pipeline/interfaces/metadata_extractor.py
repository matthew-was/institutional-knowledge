"""PatternMetadataExtractor abstract base class (ADR-012)."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class MetadataResult:
    document_type: str | None
    dates: list[str]
    people: list[str]
    organisations: list[str]
    land_references: list[str]
    description: str | None
    detection_confidence: dict[str, float]


class PatternMetadataExtractor(ABC):
    @abstractmethod
    def extract(self, text: str, document_type_hint: str | None) -> MetadataResult: ...
