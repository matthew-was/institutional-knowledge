"""Fake PatternMetadataExtractor implementations for Tier 2 tests."""

from pipeline.interfaces.metadata_extractor import (
    MetadataResult,
    PatternMetadataExtractor,
)


class MinimalMetadataExtractor(PatternMetadataExtractor):
    """Returns a minimal MetadataResult with a known document_type."""

    def extract(self, text: str, document_type_hint: str | None) -> MetadataResult:
        return MetadataResult(
            document_type="deed",
            dates=["1967-03-15"],
            people=["John Smith"],
            organisations=[],
            land_references=["East Meadow"],
            description="Transfer of East Meadow to John Smith",
            detection_confidence={"document_type": 0.9},
        )
