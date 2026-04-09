"""RegexPatternExtractor — Phase 1 pattern-based metadata extraction (ADR-012)."""

import re

import structlog

from pipeline.interfaces.metadata_extractor import (
    MetadataResult,
    PatternMetadataExtractor,
)
from shared.config import MetadataConfig


class RegexPatternExtractor(PatternMetadataExtractor):
    def __init__(self, config: MetadataConfig, log: structlog.BoundLogger) -> None:
        self.log = log.bind(service="regex_pattern_extractor")
        try:
            self._document_type_patterns = [
                re.compile(p) for p in config.PATTERNS.DOCUMENT_TYPE
            ]
            self._dates_patterns = [re.compile(p) for p in config.PATTERNS.DATES]
            self._people_patterns = [re.compile(p) for p in config.PATTERNS.PEOPLE]
            self._organisations_patterns = [
                re.compile(p) for p in config.PATTERNS.ORGANISATIONS
            ]
            self._land_references_patterns = [
                re.compile(p) for p in config.PATTERNS.LAND_REFERENCES
            ]
            self._description_patterns = [
                re.compile(p) for p in config.PATTERNS.DESCRIPTION
            ]
        except re.PatternError as err_info:
            self.log.error(
                "error compiling regex patterns for regex pattern extractor",
                error=str(err_info),
            )
            raise

    def _match_scalar_fields(
        self, field: str, text: str, regex_patterns: list[re.Pattern[str]]
    ) -> tuple[str | None, float]:
        self.log.debug("matching scalar fields for field", field=field)
        for pattern in regex_patterns:
            pattern_matches = pattern.findall(text)

            if len(pattern_matches) > 0:
                self.log.debug("scalar match found", field=field)
                return (pattern_matches[0], 1.0)

        self.log.debug("no scalar match found", field=field)
        return (None, 0.0)

    def _match_list_fields(
        self, field: str, text: str, regex_patterns: list[re.Pattern[str]]
    ) -> tuple[list[str], float]:
        self.log.debug("matching list fields for field", field=field)
        matches: list[str] = []
        for pattern in regex_patterns:
            matches.extend(pattern.findall(text))

        if len(matches) > 0:
            self.log.debug("list fields matched", field=field, matches=len(matches))
            return (list(dict.fromkeys(matches)), 1.0)

        self.log.debug("no list fields matched", field=field)
        return ([], 0.0)

    def extract(self, text: str, document_type_hint: str | None) -> MetadataResult:
        if len(text) == 0:
            return MetadataResult(
                document_type=document_type_hint,
                dates=[],
                people=[],
                organisations=[],
                land_references=[],
                description=None,
                detection_confidence={
                    "document_type": 0.0,
                    "dates": 0.0,
                    "people": 0.0,
                    "organisations": 0.0,
                    "land_references": 0.0,
                    "description": 0.0,
                },
            )

        document_type_match, document_type_confidence = self._match_scalar_fields(
            field="document_type",
            text=text,
            regex_patterns=self._document_type_patterns,
        )

        document_type_final = document_type_hint

        if document_type_match is not None:
            document_type_final = document_type_match

        dates_matches, dates_confidence = self._match_list_fields(
            field="dates", text=text, regex_patterns=self._dates_patterns
        )

        people_matches, people_confidence = self._match_list_fields(
            field="people", text=text, regex_patterns=self._people_patterns
        )

        organisations_matches, organisations_confidence = self._match_list_fields(
            field="organisations",
            text=text,
            regex_patterns=self._organisations_patterns,
        )

        land_references_matches, land_references_confidence = self._match_list_fields(
            field="land_references",
            text=text,
            regex_patterns=self._land_references_patterns,
        )

        description_match, description_confidence = self._match_scalar_fields(
            field="description", text=text, regex_patterns=self._description_patterns
        )

        return MetadataResult(
            document_type=document_type_final,
            dates=dates_matches,
            people=people_matches,
            organisations=organisations_matches,
            land_references=land_references_matches,
            description=description_match,
            detection_confidence={
                "document_type": document_type_confidence,
                "dates": dates_confidence,
                "people": people_confidence,
                "organisations": organisations_confidence,
                "land_references": land_references_confidence,
                "description": description_confidence,
            },
        )
