"""MetadataCompletenessScorer abstract base class (ADR-012)."""

from abc import ABC, abstractmethod
from dataclasses import dataclass

from pipeline.interfaces.metadata_extractor import MetadataResult


@dataclass
class CompletenessResult:
    score: float
    passed_threshold: bool
    detected_fields: list[str]
    missing_fields: list[str]


class MetadataCompletenessScorer(ABC):
    @abstractmethod
    def score(self, metadata_result: MetadataResult) -> CompletenessResult: ...
