"""WeightedTextQualityScorer — Phase 1 text quality scoring implementation (ADR-011)."""

from pipeline.interfaces.text_quality_scorer import QualityResult, TextQualityScorer
from shared.config import OCRConfig


class WeightedTextQualityScorer(TextQualityScorer):
    def __init__(self, config: OCRConfig) -> None:
        self._threshold = config.QUALITY_THRESHOLD
        self._confidence_weight = config.QUALITY_SCORING.CONFIDENCE_WEIGHT
        self._density_weight = config.QUALITY_SCORING.DENSITY_WEIGHT
        self._target_chars_per_page = config.QUALITY_SCORING.TARGET_CHARS_PER_PAGE

    def score(
        self, text_per_page: list[str], confidence_per_page: list[float]
    ) -> QualityResult:
        if len(text_per_page) == 0:
            return QualityResult(
                per_page_scores=[],
                document_score=0.0,
                passed_threshold=False,
                failing_pages=[],
            )

        per_page_scores: list[float] = []
        failing_pages: list[int] = []

        for i, page in enumerate(text_per_page):
            confidence_score_i = confidence_per_page[i] * 100
            density_score_i = min(len(page) / self._target_chars_per_page, 1.0) * 100

            per_page_score_i = (confidence_score_i * self._confidence_weight) + (
                density_score_i * self._density_weight
            )
            per_page_scores.append(per_page_score_i)

            if per_page_score_i < self._threshold:
                failing_pages.append(i + 1)

        document_score = sum(per_page_scores) / len(per_page_scores)
        passed_threshold = len(failing_pages) == 0

        return QualityResult(
            per_page_scores=per_page_scores,
            document_score=document_score,
            passed_threshold=passed_threshold,
            failing_pages=failing_pages,
        )
