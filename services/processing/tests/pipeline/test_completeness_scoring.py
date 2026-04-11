import pytest

from pipeline.interfaces.metadata_extractor import MetadataResult
from pipeline.steps.completeness_scoring import WeightedFieldPresenceScorer
from shared.config import (
    MetadataCompletenessWeights,
    MetadataConfig,
    MetadataPatternsConfig,
)


def make_weighted_field_presence_scorer() -> WeightedFieldPresenceScorer:
    patterns = MetadataPatternsConfig(
        DOCUMENT_TYPE=[],
        DATES=[],
        PEOPLE=[],
        ORGANISATIONS=[],
        LAND_REFERENCES=[],
        DESCRIPTION=[],
    )
    completeness_weights = MetadataCompletenessWeights(
        DOCUMENT_TYPE=0.2,
        DATES=0.15,
        PEOPLE=0.15,
        ORGANISATIONS=0.15,
        LAND_REFERENCES=0.15,
        DESCRIPTION=0.2,
    )
    config = MetadataConfig(
        EXTRACTOR="regex",
        PATTERNS=patterns,
        COMPLETENESS_THRESHOLD=50.0,
        COMPLETENESS_WEIGHTS=completeness_weights,
    )
    return WeightedFieldPresenceScorer(config=config)


def test_all_fields_populated() -> None:
    scorer = make_weighted_field_presence_scorer()
    metadata_result = MetadataResult(
        document_type="deed",
        dates=["1954-03-01"],
        people=["John Smith"],
        organisations=["Land Registry"],
        land_references=["Lot 12, Parish of Buckland"],
        description="Transfer of freehold land.",
        detection_confidence={},
    )
    result = scorer.score(metadata_result=metadata_result)
    assert result.score == pytest.approx(100.0)
    assert result.passed_threshold is True
    assert result.detected_fields == [
        "document_type",
        "description",
        "dates",
        "people",
        "organisations",
        "land_references",
    ]
    assert result.missing_fields == []


def test_no_fields_populated() -> None:
    scorer = make_weighted_field_presence_scorer()
    metadata_result = MetadataResult(
        document_type="",
        dates=[],
        people=[],
        organisations=[],
        land_references=[],
        description=None,
        detection_confidence={},
    )
    result = scorer.score(metadata_result=metadata_result)
    assert result.score == pytest.approx(0.0)
    assert result.passed_threshold is False
    assert result.detected_fields == []
    assert result.missing_fields == [
        "document_type",
        "description",
        "dates",
        "people",
        "organisations",
        "land_references",
    ]


def test_populated_fields_above_threshold() -> None:
    scorer = make_weighted_field_presence_scorer()
    metadata_result = MetadataResult(
        document_type="deed",
        dates=["1954-03-01"],
        people=["John Smith"],
        organisations=["Land Registry"],
        land_references=[],
        description=None,
        detection_confidence={},
    )
    result = scorer.score(metadata_result=metadata_result)
    # document_type = 0.2, dates, people, organisations = 3 * 0.15 = 0.45
    # Total (0.2 + 0.45) * 100 = 65.0
    assert result.score == pytest.approx(65.0)
    assert result.passed_threshold is True
    assert result.detected_fields == [
        "document_type",
        "dates",
        "people",
        "organisations",
    ]
    assert result.missing_fields == [
        "description",
        "land_references",
    ]


def test_populated_fields_below_threshold() -> None:
    scorer = make_weighted_field_presence_scorer()
    metadata_result = MetadataResult(
        document_type="",
        dates=[],
        people=[],
        organisations=[],
        land_references=["Lot 12, Parish of Buckland"],
        description="Transfer of freehold land.",
        detection_confidence={},
    )
    result = scorer.score(metadata_result=metadata_result)
    # description = 0.2, land_references = 0.15
    # Total (0.2 + 0.15) * 100 = 35.0
    assert result.score == pytest.approx(35.0)
    assert result.passed_threshold is False
    assert result.detected_fields == [
        "description",
        "land_references",
    ]
    assert result.missing_fields == [
        "document_type",
        "dates",
        "people",
        "organisations",
    ]
