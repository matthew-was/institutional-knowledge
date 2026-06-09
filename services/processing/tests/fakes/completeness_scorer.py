"""Fake MetadataCompletenessScorer implementations for Tier 2 tests."""

from pipeline.interfaces.completeness_scorer import (
    CompletenessResult,
    MetadataCompletenessScorer,
)
from pipeline.interfaces.metadata_extractor import MetadataResult


class PassingCompletenessScorer(MetadataCompletenessScorer):
    """Always returns a passing completeness result."""

    def score(self, metadata_result: MetadataResult) -> CompletenessResult:
        return CompletenessResult(
            score=100.0,
            passed_threshold=True,
            detected_fields=["document_type", "dates", "people", "land_references"],
            missing_fields=[],
        )


class FailingCompletenessScorer(MetadataCompletenessScorer):
    """Always returns a failing completeness result."""

    def score(self, metadata_result: MetadataResult) -> CompletenessResult:
        return CompletenessResult(
            score=0.0,
            passed_threshold=False,
            detected_fields=[],
            missing_fields=[
                "document_type",
                "dates",
                "people",
                "organisations",
                "land_references",
                "description",
            ],
        )
