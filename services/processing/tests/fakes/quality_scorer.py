"""Fake TextQualityScorer implementations for Tier 2 tests."""

from pipeline.interfaces.text_quality_scorer import QualityResult, TextQualityScorer


class PassingQualityScorer(TextQualityScorer):
    """Always returns a passing quality result."""

    def score(
        self, text_per_page: list[str], confidence_per_page: list[float]
    ) -> QualityResult:
        return QualityResult(
            per_page_scores=[100.0] * len(text_per_page),
            document_score=100.0,
            passed_threshold=True,
            failing_pages=[],
        )


class FailingQualityScorer(TextQualityScorer):
    """Always returns a failing quality result (page 1 below threshold)."""

    def score(
        self, text_per_page: list[str], confidence_per_page: list[float]
    ) -> QualityResult:
        failing_pages = list(range(1, len(text_per_page) + 1))
        return QualityResult(
            per_page_scores=[0.0] * len(text_per_page),
            document_score=0.0,
            passed_threshold=False,
            failing_pages=failing_pages,
        )
