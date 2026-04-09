"""Metadata extractor factory — selects adapter from config (ADR-012)."""

import structlog

from pipeline.adapters.regex_pattern_extractor import RegexPatternExtractor
from pipeline.interfaces.metadata_extractor import PatternMetadataExtractor
from shared.config import AppConfig


def create_metadata_extractor(
    config: AppConfig, log: structlog.BoundLogger
) -> PatternMetadataExtractor:
    if config.PROCESSING.METADATA.EXTRACTOR == "regex":
        return RegexPatternExtractor(config=config.PROCESSING.METADATA, log=log)

    raise ValueError(
        f"{config.PROCESSING.METADATA.EXTRACTOR} is not a supported Metadata Extractor"
    )
