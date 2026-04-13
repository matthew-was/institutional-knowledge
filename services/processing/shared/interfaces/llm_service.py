"""
LLMService abstract base class — shared interface for pipeline and query.

ADR-042, ADR-038.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ChunkResult:
    text: str
    chunk_index: int
    token_count: int


@dataclass
class EntityResult:
    name: str
    type: str
    confidence: float
    normalised_name: str


@dataclass
class RelationshipResult:
    source_entity_name: str
    target_entity_name: str
    relationship_type: str
    confidence: float


@dataclass
class LLMCombinedResult:
    chunks: list[ChunkResult] = field(default_factory=list)
    # metadata structure will be tightened in phase 2
    metadata_fields: dict[str, Any] = field(default_factory=dict)
    entities: list[EntityResult] = field(default_factory=list)
    relationships: list[RelationshipResult] = field(default_factory=list)


class LLMService(ABC):
    @abstractmethod
    def combined_pass(
        self, text: str, document_type: str | None
    ) -> LLMCombinedResult | None: ...

    @abstractmethod
    def close(self) -> None: ...
