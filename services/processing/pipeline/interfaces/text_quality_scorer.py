"""TextQualityScorer abstract base class (ADR-011)."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class QualityResult:
    per_page_scores: list[float]
    document_score: float
    passed_threshold: bool
    failing_pages: list[int]


class TextQualityScorer(ABC):
    @abstractmethod
    def score(
        self, text_per_page: list[str], confidence_per_page: list[float]
    ) -> QualityResult: ...
