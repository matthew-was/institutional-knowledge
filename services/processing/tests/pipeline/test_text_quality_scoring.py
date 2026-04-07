import pytest

from pipeline.steps.text_quality_scoring import WeightedTextQualityScorer
from shared.config import OCRConfig, OCRQualityScoringConfig


def make_scorer(
    threshold: float,
    confidence_weight: float,
    density_weight: float,
    target_chars: int = 1800,
) -> WeightedTextQualityScorer:
    config = OCRConfig(
        PROVIDER="docling",
        QUALITY_THRESHOLD=threshold,
        QUALITY_SCORING=OCRQualityScoringConfig(
            CONFIDENCE_WEIGHT=confidence_weight,
            DENSITY_WEIGHT=density_weight,
            TARGET_CHARS_PER_PAGE=target_chars,
        ),
    )
    return WeightedTextQualityScorer(config)


def test_all_pages_pass_threshold() -> None:
    scorer = make_scorer(
        threshold=50, confidence_weight=0.5, density_weight=0.5, target_chars=100
    )

    text_per_page = ["a" * 100, "b" * 100, "c" * 100]
    confidence_per_page = [1.0, 1.0, 1.0]

    result = scorer.score(
        text_per_page=text_per_page, confidence_per_page=confidence_per_page
    )

    assert result.passed_threshold is True
    assert result.failing_pages == []


def test_single_page_below_threshold() -> None:
    scorer = make_scorer(
        threshold=50, confidence_weight=0.5, density_weight=0.5, target_chars=100
    )

    text_per_page = ["a" * 100, "b" * 10, "c" * 100]
    confidence_per_page = [1.0, 0.1, 1.0]

    result = scorer.score(
        text_per_page=text_per_page, confidence_per_page=confidence_per_page
    )

    assert result.passed_threshold is False
    assert result.failing_pages == [2]


def test_all_pages_scored_no_early_exit() -> None:
    scorer = make_scorer(
        threshold=50, confidence_weight=0.5, density_weight=0.5, target_chars=100
    )

    text_per_page = ["a" * 100, "b" * 1, "c" * 90]
    confidence_per_page = [1.0, 0.9, 0.01]

    result = scorer.score(
        text_per_page=text_per_page, confidence_per_page=confidence_per_page
    )

    assert result.passed_threshold is False
    assert result.failing_pages == [2, 3]


def test_document_score_is_arithmetic_mean() -> None:
    confidence_weight = 0.5
    density_weight = 0.5
    target_chars = 100
    scorer = make_scorer(
        threshold=50,
        confidence_weight=confidence_weight,
        density_weight=density_weight,
        target_chars=target_chars,
    )

    text_per_page = ["a" * 90, "b" * 90]
    confidence_per_page = [0.9, 0.9]

    result = scorer.score(
        text_per_page=text_per_page, confidence_per_page=confidence_per_page
    )

    page_1_score = (confidence_per_page[0] * 100 * confidence_weight) + (
        (len(text_per_page[0]) / target_chars) * 100 * density_weight
    )
    page_2_score = (confidence_per_page[1] * 100 * confidence_weight) + (
        (len(text_per_page[1]) / target_chars) * 100 * density_weight
    )

    calculated_document_score = (page_1_score + page_2_score) / 2

    assert result.passed_threshold is True
    assert result.document_score == pytest.approx(calculated_document_score)


def test_zero_pages_returns_failed() -> None:
    scorer = make_scorer(
        threshold=50, confidence_weight=0.5, density_weight=0.5, target_chars=100
    )

    result = scorer.score(text_per_page=[], confidence_per_page=[])

    assert result.passed_threshold is False
    assert result.failing_pages == []
    assert result.document_score == 0.0
