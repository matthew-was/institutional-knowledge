"""WeightedFieldPresenceScorer — Phase 1 metadata completeness scoring (ADR-012)."""

from pipeline.interfaces.completeness_scorer import (
    CompletenessResult,
    MetadataCompletenessScorer,
)
from pipeline.interfaces.metadata_extractor import MetadataResult
from shared.config import MetadataConfig


class WeightedFieldPresenceScorer(MetadataCompletenessScorer):
    def __init__(self, config: MetadataConfig) -> None:
        self._weights = config.COMPLETENESS_WEIGHTS
        self._threshold = config.COMPLETENESS_THRESHOLD

    def score(self, metadata_result: MetadataResult) -> CompletenessResult:
        weights_dict = self._weights.model_dump()

        detected_fields_weights: float = 0.0
        detected_fields: list[str] = []
        missing_fields: list[str] = []

        scalar_fields = ["document_type", "description"]

        for scalar_field in scalar_fields:
            value = getattr(metadata_result, scalar_field)
            if value is not None and value != "":
                detected_fields_weights += weights_dict[scalar_field.upper()]
                detected_fields.append(scalar_field)
            else:
                missing_fields.append(scalar_field)

        list_fields = ["dates", "people", "organisations", "land_references"]

        for list_field in list_fields:
            value = getattr(metadata_result, list_field)
            if len(value) > 0:
                detected_fields_weights += weights_dict[list_field.upper()]
                detected_fields.append(list_field)
            else:
                missing_fields.append(list_field)

        total_weights_sum: float = sum(weights_dict.values())

        score = (detected_fields_weights / total_weights_sum) * 100

        passed_threshold = score >= self._threshold

        return CompletenessResult(
            score=score,
            passed_threshold=passed_threshold,
            detected_fields=detected_fields,
            missing_fields=missing_fields,
        )
