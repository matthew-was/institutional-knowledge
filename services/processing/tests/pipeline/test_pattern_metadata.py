import re

import pytest
import structlog

from pipeline.adapters.regex_pattern_extractor import RegexPatternExtractor
from shared.config import (
    MetadataCompletenessWeights,
    MetadataConfig,
    MetadataPatternsConfig,
)

test_text = "On 14th March 1923, Mr. Thomas Hargreaves of the Waikato Farming Society transferred Lot 7 and Section 12 to his son James Hargreaves. The deed of conveyance was witnessed by Dr. Elizabeth Crane at the offices of Hargreaves & Sons Ltd. Re: Transfer of land at Block 4, comprising 48 acres, formerly in the name of William James Hargreaves. The mortgage deed dated 22/03/1923 was discharged on the same day."  # noqa: E501

test_text_no_match_on_date_or_document_type = "On 14th March 1923, Mr. Thomas Hargreaves of the Waikato Farming Society transferred Lot 7 and Section 12 to his son James Hargreaves. The transfer was witnessed by Dr. Elizabeth Crane at the offices of Hargreaves & Sons Ltd. Re: Transfer of land at Block 4, comprising 48 acres, formerly in the name of William James Hargreaves."  # noqa: E501


def make_extractor(
    override_patterns: dict[str, list[str]],
) -> RegexPatternExtractor:
    patterns = MetadataPatternsConfig(
        DOCUMENT_TYPE=override_patterns.get("DOCUMENT_TYPE", []),
        DATES=override_patterns.get("DATES", []),
        PEOPLE=override_patterns.get("PEOPLE", []),
        ORGANISATIONS=override_patterns.get("ORGANISATIONS", []),
        LAND_REFERENCES=override_patterns.get("LAND_REFERENCES", []),
        DESCRIPTION=override_patterns.get("DESCRIPTION", []),
    )
    completeness_weights = MetadataCompletenessWeights(
        DOCUMENT_TYPE=0.0,
        DATES=0.0,
        PEOPLE=0.0,
        ORGANISATIONS=0.0,
        LAND_REFERENCES=0.0,
        DESCRIPTION=0.0,
    )
    config = MetadataConfig(
        EXTRACTOR="regex",
        PATTERNS=patterns,
        COMPLETENESS_THRESHOLD=50.0,
        COMPLETENESS_WEIGHTS=completeness_weights,
    )
    return RegexPatternExtractor(config=config, log=structlog.get_logger())


def test_date_pattern_match() -> None:
    extractor = make_extractor(
        override_patterns={"DATES": ["\\b\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}\\b"]},
    )
    result = extractor.extract(text=test_text, document_type_hint=None)
    assert result.document_type is None
    assert result.detection_confidence["document_type"] == 0.0
    assert len(result.dates) == 1
    assert result.dates[0] == "22/03/1923"
    assert result.detection_confidence["dates"] == 1.0


def test_date_pattern_no_match() -> None:
    extractor = make_extractor(
        override_patterns={"DATES": ["\\b\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}\\b"]},
    )
    result = extractor.extract(
        text=test_text_no_match_on_date_or_document_type, document_type_hint=None
    )
    assert result.description is None
    assert len(result.dates) == 0
    assert result.detection_confidence["dates"] == 0.0


def test_no_matches() -> None:
    extractor = make_extractor(override_patterns={})
    result = extractor.extract(text=test_text, document_type_hint=None)
    assert result.document_type is None
    assert result.detection_confidence["document_type"] == 0.0
    assert result.description is None
    assert len(result.dates) == 0
    assert result.detection_confidence["dates"] == 0.0
    assert result.people == []
    assert result.organisations == []
    assert result.land_references == []
    assert result.detection_confidence["people"] == 0.0
    assert result.detection_confidence["organisations"] == 0.0
    assert result.detection_confidence["land_references"] == 0.0
    assert result.detection_confidence["description"] == 0.0


def test_malformed_regex() -> None:
    with pytest.raises(re.PatternError):
        make_extractor(override_patterns={"DATES": ["["]})


def test_document_type_pattern_match() -> None:
    extractor = make_extractor(
        override_patterns={"DOCUMENT_TYPE": ["(?i)\\bdeed of conveyance\\b"]}
    )
    result = extractor.extract(text=test_text, document_type_hint=None)
    assert result.document_type == "deed of conveyance"
    assert result.detection_confidence["document_type"] == 1.0


def test_document_type_hint_is_overwritten() -> None:
    extractor = make_extractor(
        override_patterns={"DOCUMENT_TYPE": ["(?i)\\bdeed of conveyance\\b"]}
    )
    result = extractor.extract(text=test_text, document_type_hint="report")
    assert result.document_type == "deed of conveyance"
    assert result.detection_confidence["document_type"] == 1.0


def test_document_type_hint_is_maintained_for_no_match() -> None:
    extractor = make_extractor(
        override_patterns={"DOCUMENT_TYPE": ["(?i)\\bdeed of conveyance\\b"]}
    )
    result = extractor.extract(
        text=test_text_no_match_on_date_or_document_type, document_type_hint="report"
    )
    assert result.document_type == "report"
    assert result.detection_confidence["document_type"] == 0.0


def test_document_type_pattern_no_match() -> None:
    extractor = make_extractor(
        override_patterns={"DOCUMENT_TYPE": ["(?i)\\bdeed of conveyance\\b"]}
    )
    result = extractor.extract(
        text=test_text_no_match_on_date_or_document_type, document_type_hint=None
    )
    assert result.document_type is None
    assert result.detection_confidence["document_type"] == 0.0


def test_people_pattern_match() -> None:
    extractor = make_extractor(
        override_patterns={
            "PEOPLE": [
                "\\b(?:Mr|Mrs|Miss|Dr|Rev)\\.?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\b"
            ]
        }
    )
    result = extractor.extract(text=test_text, document_type_hint=None)
    assert len(result.people) == 2
    assert "Mr. Thomas Hargreaves" in result.people
    assert result.detection_confidence["people"] == 1.0


def test_organisation_pattern_match() -> None:
    extractor = make_extractor(
        override_patterns={
            "ORGANISATIONS": [
                "\\b(?:[A-Z][a-z]+\\s+)+(?:Ltd|Limited|Co|Company|Council|Association|Society|Bank)\\b"
            ]
        }
    )
    result = extractor.extract(text=test_text, document_type_hint=None)
    assert len(result.organisations) == 2
    assert "Waikato Farming Society" in result.organisations
    assert result.detection_confidence["organisations"] == 1.0


def test_land_reference_pattern_match() -> None:
    extractor = make_extractor(
        override_patterns={"LAND_REFERENCES": ["\\bLot\\s+\\d+\\b"]}
    )
    result = extractor.extract(text=test_text, document_type_hint=None)
    assert len(result.land_references) == 1
    assert "Lot 7" in result.land_references
    assert result.detection_confidence["land_references"] == 1.0


def test_description_pattern_match() -> None:
    extractor = make_extractor(
        override_patterns={"DESCRIPTION": ["(?i)re:\\s*([^.\\n]+)"]}
    )
    result = extractor.extract(text=test_text, document_type_hint=None)
    assert (
        result.description
        == "Transfer of land at Block 4, comprising 48 acres, formerly in the name of William James Hargreaves"  # noqa: E501
    )
    assert result.detection_confidence["description"] == 1.0
