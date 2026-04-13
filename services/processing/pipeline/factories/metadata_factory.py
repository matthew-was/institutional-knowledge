"""Metadata extractor factory — selects adapter from config (ADR-012)."""

import structlog

from pipeline.adapters.regex_pattern_extractor import RegexPatternExtractor
from pipeline.interfaces.metadata_extractor import PatternMetadataExtractor
from shared.config import MetadataConfig


def create_metadata_extractor(
    config: MetadataConfig, log: structlog.BoundLogger
) -> PatternMetadataExtractor:
    if config.EXTRACTOR == "regex":
        return RegexPatternExtractor(config=config, log=log)

    raise ValueError(f"{config.EXTRACTOR} is not a supported Metadata Extractor")
